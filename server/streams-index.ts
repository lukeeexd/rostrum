import type { SoakResult } from "../src/api/types";
import { streamStatus, type StreamStatus } from "../src/lib/streamStatus";
import { projectSoak } from "./channels";
import { createLimiter, shared } from "./load";
import { id, num, str } from "./pick";
import type { PodiumClient } from "./podium";
import { classify } from "./upstream";

/**
 * Every stream on every channel, from one walk of Podium's channel previews
 * (read-only, a few milliseconds each). The soak log reads it on the history
 * tick, Connect events use it to name the streams they only give ids for,
 * and Problem channels sort every channel by it. One cached walk serves all.
 */

/** Previews in flight at once during a walk. */
const WALK_SLOTS = 4;
/** A walk is reused this long; the history tick is 5 minutes, so it always gets a fresh one. */
const WALK_TTL_MS = 60_000;
/** A failed walk is not retried for this long, so a refreshing page cannot start one per poll. */
const WALK_FAIL_TTL_MS = 30_000;

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
  /** When the walk ran. */
  walkedAt: number;
  streams: Map<number, IndexedStream>;
  channels: IndexedChannel[];
  /** Channel ids by (redacted) name, for events that name a channel but carry no id; null when several share the name. */
  channelsByName: Map<string, number | null>;
}

/**
 * Walks every channel's preview. A stream on several channels is taken from
 * the first; a channel deleted between reading the list and previewing it is
 * skipped; any other failure fails the walk.
 */
export async function walkPreviews(podium: PodiumClient, now: () => number = Date.now): Promise<StreamIndex> {
  const state = await podium.state();
  const channels = (state.groups ?? []).flatMap((g) =>
    (g.rows ?? []).flatMap((r) => {
      const channelId = id(r.id);
      return channelId == null ? [] : [{ channelId, channelName: str(r.name), group: str(g.name), groupId: id(g.id) }];
    }),
  );
  const limit = createLimiter(WALK_SLOTS);
  const previews = await Promise.all(
    channels.map((c) =>
      limit(async () => {
        try {
          return { ...c, streams: (await podium.preview(c.channelId)).currentOrder ?? [] };
        } catch (err) {
          if (classify(err) === "not_found") return { ...c, streams: [] };
          throw err;
        }
      }),
    ),
  );

  const index: StreamIndex = { walkedAt: now(), streams: new Map(), channels: [], channelsByName: new Map() };
  for (const { channelId, channelName, group, groupId, streams } of previews) {
    if (channelName) index.channelsByName.set(channelName, index.channelsByName.has(channelName) ? null : channelId);
    const entries: ChannelStreamEntry[] = [];
    // Dispatcharr's order; a stream without a rank keeps its place after the ranked ones.
    const ordered = streams
      .map((s, i) => ({ s, rank: num(s.currentRank) ?? Number.MAX_SAFE_INTEGER, i }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map(({ s }) => s);
    for (const s of ordered) {
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
        name: str(s.raw),
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

/**
 * The walk behind a short cache, with loads in flight shared between callers.
 * Callers cannot cancel it (it is shared); each Podium call has its own timeout.
 */
export function createStreamIndex(podium: PodiumClient, now: () => number = Date.now): () => Promise<StreamIndex> {
  const cache = shared<"all", StreamIndex>(WALK_TTL_MS, 1, now, WALK_FAIL_TTL_MS);
  return () => cache("all", () => walkPreviews(podium, now));
}
