import { streamStatus } from "../src/lib/streamStatus";
import { id, num } from "./pick";
import { PROBE_HISTORY_MAX_LIMIT, PROBE_HISTORY_MAX_STREAMS, type PodiumClient, type PodiumProbeHistory } from "./podium";
import { createRouteSupport, podiumVersion, routeMissing } from "./route-support";
import type { LoggedProbe } from "./stream-probes";
import type { StreamIndex } from "./streams-index";
import { UpstreamError } from "./upstream";

/**
 * The probes to log on each history tick, from two places:
 *
 * - The stream index: each stream's latest probe. Works with any Podium, and
 *   since Podium probes a stream about once a day, it catches nearly every
 *   probe while Rostrum is running.
 * - Podium's GET /api/probe-history (Podium 1.18+): each stream's history is
 *   read back once (up to Podium's 30 days, 500 streams a request, streams
 *   that appear later included); after that each read asks only for probes
 *   since the last one, so a stretch Rostrum was not running is filled in too. A Podium without it is asked again later (route-support.ts); one
 *   that fails this time is asked again next tick, from the same point.
 *
 * The log dedupes by stream and probe time, so overlap between the two (and
 * between reads) is harmless.
 */

/** Each read reaches back this far before the previous one, since a probe can be committed just after a read that missed it. */
export const OVERLAP_MS = 60_000;

/** The latest probe of every stream the index has, where there is one. */
export function probesFromIndex(index: StreamIndex): LoggedProbe[] {
  return [...index.streams.values()].flatMap((s) =>
    s.probedAt == null || s.status === "unprobed" ? [] : [{ streamId: s.streamId, probedAt: s.probedAt, status: s.status, name: s.name, provider: s.provider }],
  );
}

/** A probe-history answer as log rows, named from the index. */
export function probesFromHistory(history: PodiumProbeHistory, index: StreamIndex): LoggedProbe[] {
  return (history.streams ?? []).flatMap((s) => {
    const streamId = id(s.id);
    if (streamId == null) return [];
    const known = index.streams.get(streamId);
    return (s.probes ?? []).flatMap((p) => {
      const probedAt = num(p.probedAt);
      const status = streamStatus({
        probedAt,
        alive: typeof p.alive === "boolean" ? p.alive : null,
        black: p.black === true,
        lowBitrate: typeof p.lowBitrate === "boolean" ? p.lowBitrate : null,
        bitrateKbps: num(p.bitrateKbps),
      });
      if (probedAt == null || status === "unprobed") return [];
      return [{ streamId, probedAt, status, name: known?.name ?? null, provider: known?.provider ?? null }];
    });
  });
}

const looksLikeHistory = (h: PodiumProbeHistory) => Array.isArray(h?.streams);

/** A tick's probes, and what to remember once they are saved (so a failed save is read again next tick). */
export interface ProbeBatch {
  probes: LoggedProbe[];
  commit(): void;
}

export function createProbeFeed(
  podium: PodiumClient,
  streams: () => Promise<StreamIndex>,
  { now = Date.now, log = console.log }: { now?: () => number; log?: (message: string) => void } = {},
) {
  const support = createRouteSupport(podiumVersion(podium), now);
  /** Streams whose history has been read back (and saved). */
  const backfilled = new Set<number>();
  /** Podium's clock at the last saved read; null until one has been. */
  let cursor: number | null = null;
  let lastFailure = "";
  let fedByPodium = false;

  /**
   * One read: the history of streams not read back yet (500 at a time), and,
   * once anything has been, every probe since the last read. Nothing is
   * remembered until `commit`.
   */
  async function readHistory(index: StreamIndex): Promise<ProbeBatch> {
    const fresh = [...index.streams.keys()].filter((id) => !backfilled.has(id));
    const requests: { streams?: number[]; since?: number }[] = [];
    for (let i = 0; i < fresh.length; i += PROBE_HISTORY_MAX_STREAMS) requests.push({ streams: fresh.slice(i, i + PROBE_HISTORY_MAX_STREAMS) });
    if (cursor != null) requests.push({ since: cursor - OVERLAP_MS });

    const probes: LoggedProbe[] = [];
    let readAt: number | null = null;
    let truncated = 0;
    for (const request of requests) {
      const history = await podium.probeHistory(request);
      if (!looksLikeHistory(history)) throw new UpstreamError("status", 404); // say, a proxy's fallback page
      if (history.cacheUnavailable) throw new Error("Podium could not read its probe history");
      readAt ??= num(history.fetchedAt) ?? now();
      truncated += (history.streams ?? []).filter((s) => (s.probes?.length ?? 0) >= PROBE_HISTORY_MAX_LIMIT).length;
      probes.push(...probesFromHistory(history, index));
    }
    if (truncated) log(`rostrum: ${truncated} streams had more probes than Podium returns at once (${PROBE_HISTORY_MAX_LIMIT}); their oldest are not logged`);
    return {
      probes,
      commit() {
        if (readAt == null) return; // nothing was read (no streams yet): try again next tick
        if (fresh.length && cursor == null) log(`rostrum: probe log back-filled ${probes.length} probes from Podium's /api/probe-history`);
        for (const id of fresh) backfilled.add(id);
        cursor = readAt;
      },
    };
  }

  return {
    /** Whether Podium's probe history fed the last tick. */
    get podiumHistory() {
      return fedByPodium;
    },
    /** This tick's probes: the index's latest, plus Podium's history when it has it. */
    async probes(): Promise<ProbeBatch> {
      const index = await streams();
      const latest = probesFromIndex(index);
      if (!(await support.worthAsking())) {
        fedByPodium = false;
        return { probes: latest, commit() {} };
      }
      try {
        const history = await readHistory(index);
        support.markFound();
        fedByPodium = true;
        lastFailure = "";
        return { probes: [...latest, ...history.probes], commit: history.commit };
      } catch (err) {
        fedByPodium = false;
        if (routeMissing(err)) {
          await support.markMissing();
        } else {
          const message = (err as Error).message;
          if (message !== lastFailure) log(`rostrum: /api/probe-history failed (${message}); logging each stream's latest probe only`);
          lastFailure = message;
        }
        return { probes: latest, commit() {} };
      }
    },
  };
}

export type ProbeFeed = ReturnType<typeof createProbeFeed>;
