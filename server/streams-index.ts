import type { SoakResult } from "../src/api/types";
import { streamStatus, type StreamStatus } from "../src/lib/streamStatus";
import { projectSoak } from "./channels";
import { createLimiter, shared } from "./load";
import { id, num, str } from "./pick";
import type { PodiumClient, PodiumPreviewStream, PodiumState, PodiumVerdicts } from "./podium";
import { classify, UpstreamError } from "./upstream";

/**
 * Every stream on every channel, read in one of two ways: one GET
 * /api/verdicts on a Podium that has it, otherwise a walk of every channel's
 * preview (read-only, a few milliseconds each). The soak log reads it on the
 * history tick, Connect events use it to name the streams they only give ids
 * for, and Problem channels and channel history sort every channel by it.
 * One cached read serves them all.
 */

/** Previews in flight at once during a walk. */
const WALK_SLOTS = 4;
/** An index is reused this long; the history tick is 5 minutes, so it always gets a fresh one. */
const INDEX_TTL_MS = 60_000;
/** A failed read is not retried for this long, so a refreshing page cannot start one per poll. */
const INDEX_FAIL_TTL_MS = 30_000;

export interface IndexedStream {
  streamId: number;
  name: string | null;
  provider: string | null;
  /** The first channel found carrying it. */
  channelId: number;
  channelName: string | null;
  lastSoak: SoakResult | null;
}

/** A stream in one channel's list, in Dispatcharr's order. */
export interface ChannelStreamEntry {
  streamId: number;
  status: StreamStatus;
}

export interface IndexedChannel {
  id: number;
  name: string;
  group: string | null;
  groupId: number | null;
  /** In Dispatcharr's order: the first is what the channel serves first. */
  streams: ChannelStreamEntry[];
}

export interface StreamIndex {
  /** When it was read (by either source). */
  walkedAt: number;
  /** Where it came from: one /api/verdicts call, or a walk of every channel's preview. */
  source: "verdicts" | "previews";
  streams: Map<number, IndexedStream>;
  channels: IndexedChannel[];
  /** Channel ids by (redacted) name, for events that name a channel but carry no id; null when several share the name. */
  channelsByName: Map<string, number | null>;
}

/** One stream as either source describes it: a preview row, or a verdicts entry (whose `name` is the preview's `raw`). */
type StreamRow = Pick<
  PodiumPreviewStream,
  "id" | "provider" | "lastProbedAt" | "lastAlive" | "lastBlack" | "lastLowBitrate" | "lastBitrateKbps" | "lastSoak"
> & { name?: string | null };

/** A channel from Podium's state, with its streams already in Dispatcharr's order. */
interface ChannelRows {
  channelId: number;
  channelName: string | null;
  group: string | null;
  groupId: number | null;
  streams: StreamRow[];
}

/** Every channel in Podium's state (including ones with no streams). */
function stateChannels(state: PodiumState): Omit<ChannelRows, "streams">[] {
  return (state.groups ?? []).flatMap((g) =>
    (g.rows ?? []).flatMap((r) => {
      const channelId = id(r.id);
      return channelId == null ? [] : [{ channelId, channelName: str(r.name), group: str(g.name), groupId: id(g.id) }];
    }),
  );
}

/** The index from each channel's ordered stream rows: statuses by the shared rule, each stream once (from the first channel carrying it). */
function buildIndex(rows: ChannelRows[], at: number, source: StreamIndex["source"]): StreamIndex {
  const index: StreamIndex = { walkedAt: at, source, streams: new Map(), channels: [], channelsByName: new Map() };
  for (const { channelId, channelName, group, groupId, streams } of rows) {
    if (channelName) index.channelsByName.set(channelName, index.channelsByName.has(channelName) ? null : channelId);
    const entries: ChannelStreamEntry[] = [];
    for (const s of streams) {
      const streamId = id(s.id);
      if (streamId == null) continue;
      entries.push({
        streamId,
        status: streamStatus({
          probedAt: num(s.lastProbedAt),
          alive: typeof s.lastAlive === "boolean" ? s.lastAlive : null,
          black: s.lastBlack === true,
          lowBitrate: typeof s.lastLowBitrate === "boolean" ? s.lastLowBitrate : null,
          bitrateKbps: num(s.lastBitrateKbps),
        }),
      });
      if (index.streams.has(streamId)) continue;
      index.streams.set(streamId, {
        streamId,
        name: str(s.name),
        provider: str(s.provider),
        channelId,
        channelName,
        lastSoak: projectSoak(s.lastSoak),
      });
    }
    index.channels.push({ id: channelId, name: channelName ?? "", group, groupId, streams: entries });
  }
  return index;
}

/** A preview's rows in Dispatcharr's order: by rank, and a stream without one keeps its place after the ranked ones. */
const previewOrder = (rows: PodiumPreviewStream[]): StreamRow[] =>
  rows
    .map((s, i) => ({ s, rank: num(s.currentRank) ?? Number.MAX_SAFE_INTEGER, i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ s }) => ({ ...s, name: s.raw }));

/**
 * Walks every channel's preview. A channel deleted between reading the list
 * and previewing it is skipped; any other failure fails the walk. Pass the
 * state when it has just been read, so it is not read twice.
 */
export async function walkPreviews(
  podium: PodiumClient,
  { state, now = Date.now }: { state?: PodiumState; now?: () => number } = {},
): Promise<StreamIndex> {
  const channels = stateChannels(state ?? (await podium.state()));
  const limit = createLimiter(WALK_SLOTS);
  const rows = await Promise.all(
    channels.map((c) =>
      limit(async () => {
        try {
          return { ...c, streams: previewOrder((await podium.preview(c.channelId)).currentOrder ?? []) };
        } catch (err) {
          if (classify(err) === "not_found") return { ...c, streams: [] };
          throw err;
        }
      }),
    ),
  );
  return buildIndex(rows, now(), "previews");
}

/**
 * The same index from one /api/verdicts answer: the channel list (empty
 * channels included) from Podium's state, each channel's streams (in slot
 * order) and their verdicts from the verdicts. Null when Podium could not
 * read its cache, so the caller can walk the previews instead.
 */
export function indexFromVerdicts(state: PodiumState, verdicts: PodiumVerdicts, at: number): StreamIndex | null {
  if (verdicts.cacheUnavailable) return null;
  const streamsById = new Map<number, StreamRow>();
  for (const s of verdicts.streams ?? []) {
    const streamId = id(s.id);
    if (streamId != null) streamsById.set(streamId, s);
  }
  const order = new Map<number, number[]>();
  for (const c of verdicts.channels ?? []) {
    const channelId = id(c.id);
    if (channelId != null) order.set(channelId, c.streams ?? []);
  }
  const rows = stateChannels(state).map((c) => ({
    ...c,
    streams: (order.get(c.channelId) ?? []).flatMap((streamId) => streamsById.get(streamId) ?? []),
  }));
  return buildIndex(rows, at, "verdicts");
}

/** After a Podium says it has no /api/verdicts, ask again this long after, whatever its version. */
export const VERDICTS_RECHECK_MS = 30 * 60_000;
/** Meanwhile, look at its version at most this often, to notice an upgrade sooner. */
export const VERSION_CHECK_MS = 5 * 60_000;

/** A Podium without the route: 404, or 405 from a framework that knows the path but not the method. */
const notSupported = (err: unknown) => err instanceof UpstreamError && (err.status === 404 || err.status === 405);

/** An answer that is not the verdicts (say, a proxy's fallback page) counts as a Podium without the route. */
const looksLikeVerdicts = (v: PodiumVerdicts) => Array.isArray(v?.channels) && Array.isArray(v?.streams);

/**
 * Reads the index from /api/verdicts when Podium has it, and walks the
 * previews otherwise:
 *
 * - A Podium without the route (404/405, or an answer that is not the
 *   verdicts) is remembered with its version, and asked again when that
 *   version changes (looked at every VERSION_CHECK_MS) or after
 *   VERDICTS_RECHECK_MS.
 * - A Podium that has it but cannot answer this time (a timeout, an error,
 *   an unreadable cache) is walked for this read, and asked first again next
 *   time.
 *
 * Which way it is reading is logged when that changes.
 */
export function createIndexLoader(podium: PodiumClient, now: () => number = Date.now, log: (message: string) => void = console.log) {
  let unsupported: { version: string | null; at: number; checkedAt: number } | null = null;
  let lastSource: StreamIndex["source"] | null = null;
  let lastFailure = "";
  const version = () => podium.health().then((h) => h.version ?? null, () => null);

  async function worthAsking(): Promise<boolean> {
    if (!unsupported) return true;
    const t = now();
    if (t - unsupported.at >= VERDICTS_RECHECK_MS) return true;
    if (t - unsupported.checkedAt < VERSION_CHECK_MS) return false;
    unsupported.checkedAt = t;
    return (await version()) !== unsupported.version;
  }

  /** The index from /api/verdicts, or null to walk the previews this time. */
  async function fromVerdicts(state: PodiumState): Promise<StreamIndex | null> {
    try {
      const verdicts = await podium.verdicts();
      if (!looksLikeVerdicts(verdicts)) throw new UpstreamError("status", 404);
      unsupported = null;
      lastFailure = "";
      return indexFromVerdicts(state, verdicts, now());
    } catch (err) {
      if (notSupported(err)) {
        const t = now();
        unsupported = { version: await version(), at: t, checkedAt: t };
      } else {
        const message = (err as Error).message;
        if (message !== lastFailure) log(`rostrum: /api/verdicts failed (${message}); reading each channel's preview instead`);
        lastFailure = message;
      }
      return null;
    }
  }

  return async function load(): Promise<StreamIndex> {
    const state = await podium.state();
    const index = ((await worthAsking()) ? await fromVerdicts(state) : null) ?? (await walkPreviews(podium, { state, now }));
    if (index.source !== lastSource) {
      log(`rostrum: stream index from ${index.source === "verdicts" ? "Podium's /api/verdicts" : "each channel's preview"}`);
      lastSource = index.source;
    }
    return index;
  };
}

/**
 * The index behind a short cache, with loads in flight shared between
 * callers. Callers cannot cancel it (it is shared); each Podium call has its
 * own timeout.
 */
export function createStreamIndex(podium: PodiumClient, now: () => number = Date.now, log?: (message: string) => void): () => Promise<StreamIndex> {
  const cache = shared<"all", StreamIndex>(INDEX_TTL_MS, 1, now, INDEX_FAIL_TTL_MS);
  // One loader for the life of the index, so what it learned about this Podium is kept between reads.
  const load = createIndexLoader(podium, now, log);
  return () => cache("all", load);
}
