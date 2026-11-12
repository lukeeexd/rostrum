import type { FlakyProvider, FlakyResponse, FlakyStream, ProbeSegment, StreamProbeHistory } from "../src/api/types";
import { isBroken, isFlaky } from "../src/lib/flips";
import type { ProbeRow } from "./stream-probes";
import type { StreamIndex } from "./streams-index";

/**
 * Flips and broken time from the probe log (pure: no database). A flip is a
 * stream going from playable (alive, low bitrate) to broken (dead, black) or
 * back between one probe and the next; the probe in force when the range
 * opens is the baseline, so a stream already broken going in is not a flip.
 */

/** Most streams listed. */
export const FLAKY_LIMIT = 200;

/** One stream's probes (time order, the in-force one first) over [from, to]. Each probe's state lasts until the next probe. */
export function summariseProbes(
  streamId: number,
  rows: ProbeRow[],
  from: number,
  to: number,
): { history: StreamProbeHistory; brokenShare: number | null; lastFlipAt: number | null } {
  const segments: ProbeSegment[] = [];
  let probes = 0;
  let flips = 0;
  let lastFlipAt: number | null = null;
  rows.forEach((r, i) => {
    const start = Math.max(r.probed_at, from);
    const end = Math.min(rows[i + 1]?.probed_at ?? to, to);
    if (end > start) segments.push({ from: start, to: end, status: r.status });
    if (r.probed_at < from) return;
    probes++;
    if (i > 0 && isBroken(rows[i - 1].status) !== isBroken(r.status)) {
      flips++;
      lastFlipAt = r.probed_at;
    }
  });
  const total = segments.reduce((n, s) => n + (s.to - s.from), 0);
  const bad = segments.reduce((n, s) => n + (isBroken(s.status) ? s.to - s.from : 0), 0);
  return { history: { streamId, probes, flips, segments }, brokenShare: total > 0 ? bad / total : null, lastFlipAt };
}

/** Rows (ordered by stream, then time) grouped per stream. */
function byStream(rows: ProbeRow[]): Map<number, ProbeRow[]> {
  const out = new Map<number, ProbeRow[]>();
  for (const r of rows) {
    const list = out.get(r.stream_id);
    if (list) list.push(r);
    else out.set(r.stream_id, [r]);
  }
  return out;
}

/** The newest non-null value of a column, for a stream the index no longer has. */
const newest = (rows: ProbeRow[], key: "name" | "provider") => rows.findLast((r) => r[key] != null)?.[key] ?? null;

const flakiness = (a: FlakyStream, b: FlakyStream) =>
  b.flips - a.flips || (b.brokenShare ?? 0) - (a.brokenShare ?? 0) || (b.lastFlipAt ?? 0) - (a.lastFlipAt ?? 0) || a.streamId - b.streamId;

/**
 * The Flaky streams page from the log over [from, to]: streams that flipped,
 * worst first, and each provider's share of flaky streams. Names, providers
 * and channels come from the index when it answered, else from the log.
 */
export function projectFlaky(
  rows: ProbeRow[],
  from: number,
  to: number,
  index: StreamIndex | null,
): Pick<FlakyResponse, "streams" | "flipping" | "flaky" | "probed" | "providers"> {
  const streams: FlakyStream[] = [];
  const providers = new Map<string, { probed: number; flaky: number }>();
  let probed = 0;
  let flaky = 0;
  for (const [streamId, list] of byStream(rows)) {
    const summary = summariseProbes(streamId, list, from, to);
    const { probes, flips } = summary.history;
    if (probes === 0) continue;
    probed++;
    if (isFlaky(flips)) flaky++;
    const known = index?.streams.get(streamId);
    const provider = known?.provider ?? newest(list, "provider");
    if (provider) {
      const p = providers.get(provider) ?? { probed: 0, flaky: 0 };
      p.probed++;
      if (isFlaky(flips)) p.flaky++;
      providers.set(provider, p);
    }
    if (flips === 0) continue;
    streams.push({
      streamId,
      name: known?.name ?? newest(list, "name"),
      provider,
      channelId: known?.channelId ?? null,
      channelName: known?.channelName ?? null,
      status: list[list.length - 1].status,
      probes,
      flips,
      brokenShare: summary.brokenShare,
      lastFlipAt: summary.lastFlipAt,
    });
  }
  streams.sort(flakiness);
  const summaries: FlakyProvider[] = [...providers]
    .map(([name, p]) => ({ name, ...p, share: p.probed > 0 ? p.flaky / p.probed : null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    streams: streams.slice(0, FLAKY_LIMIT),
    flipping: streams.length,
    flaky,
    probed,
    providers: summaries,
  };
}

/** Each of a channel's streams (in its order) over [from, to]. */
export function channelProbes(rows: ProbeRow[], streamIds: number[], from: number, to: number): StreamProbeHistory[] {
  const grouped = byStream(rows);
  return streamIds.map((id) => summariseProbes(id, grouped.get(id) ?? [], from, to).history);
}
