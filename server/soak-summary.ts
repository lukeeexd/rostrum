import type {
  SoakProviderSummary,
  SoakRecord,
  SoakStreamSummary,
  SoakTally,
  SoaksResponse,
} from "../src/api/types";
import { notClean } from "../src/lib/soak";

/**
 * What the soak log adds up to: each result's verdict, and the Soak page's
 * totals, provider tallies, failing streams and latest results. Pure, so the
 * browser tests can build realistic responses from it.
 */

/** Most failing streams and recent soaks returned; the page shows fewer. */
export const FAILING_LIMIT = 100;
export const RECENT_LIMIT = 50;

const emptyTally = (): SoakTally => ({ soaks: 0, clean: 0, dropped: 0, unreachable: 0 });
function count(t: SoakTally, r: SoakRecord) {
  t.soaks++;
  t[r.verdict]++;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The page's numbers from the soaks in range; `records` must be newest first. */
export function summariseSoaks(records: SoakRecord[]): Pick<SoaksResponse, "totals" | "providers" | "failing" | "recent"> {
  const totals = { ...emptyTally(), streams: new Set(records.map((r) => r.streamId)).size };
  const providers = new Map<string, SoakProviderSummary & { held: number[]; ids: Set<number> }>();
  const streams = new Map<number, SoakStreamSummary>();

  for (const r of records) {
    count(totals, r);

    let p = providers.get(r.provider);
    if (!p) providers.set(r.provider, (p = { name: r.provider, ...emptyTally(), streams: 0, medianHeldMs: null, drops: 0, held: [], ids: new Set() }));
    count(p, r);
    p.ids.add(r.streamId);
    p.drops += r.drops;
    if (r.verdict !== "unreachable") p.held.push(r.heldMs);

    // The first record seen for a stream is its newest, so it names the stream and is its latest result.
    let s = streams.get(r.streamId);
    if (!s) {
      const { streamId, name, provider, channelId, channelName } = r;
      streams.set(r.streamId, (s = { streamId, name, provider, channelId, channelName, ...emptyTally(), drops: 0, latest: r }));
    }
    count(s, r);
    s.drops += r.drops;
  }

  return {
    totals,
    providers: [...providers.values()]
      .map(({ held, ids, ...p }) => ({ ...p, streams: ids.size, medianHeldMs: median(held) }))
      .sort((a, b) => b.soaks - a.soaks || a.name.localeCompare(b.name)),
    failing: [...streams.values()]
      .filter((s) => notClean(s) > 0)
      .sort((a, b) => notClean(b) - notClean(a) || b.drops - a.drops || b.latest.completedAt - a.latest.completedAt)
      .slice(0, FAILING_LIMIT),
    recent: records.slice(0, RECENT_LIMIT),
  };
}
