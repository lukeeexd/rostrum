import { CHARTED_PROBLEMS, type HistoryRange, type Snapshot, type StreamState } from "@/api/types";

/** One row of chart data: the time plus one value per series key. */
export type Row = { t: number } & Record<string, number | null>;

/** The states worth watching; alive streams dwarf them, so they are charted on their own. */
const PROBLEMS: StreamState[] = ["low_bitrate", "black", "dead"];

/** Problem stream counts by state, for a stacked area. */
export const problemRows = (points: Snapshot[]): Row[] =>
  points.map((p) => ({ t: p.t, ...Object.fromEntries(PROBLEMS.map((s) => [s, p.streams[s]])) }));

/** Problem channel counts; null (a gap) where a snapshot has none. */
export const problemChannelRows = (points: Snapshot[]): Row[] =>
  points.map((p) => ({ t: p.t, ...Object.fromEntries(CHARTED_PROBLEMS.map((k) => [k, p.problems?.[k] ?? null])) }));

/** Share of channels whose first stream is healthy, 0–100. */
export const primaryRows = (points: Snapshot[]): Row[] =>
  points.map((p) => ({ t: p.t, healthy: p.primary.total ? (p.primary.healthy / p.primary.total) * 100 : null }));

/** Age of the oldest verdict in service against Podium's target, both in hours. */
export const freshnessRows = (points: Snapshot[]): Row[] =>
  points.map((p) => ({
    t: p.t,
    oldest: p.freshness.oldestSeconds == null ? null : p.freshness.oldestSeconds / 3600,
    target: p.freshness.targetSeconds ? p.freshness.targetSeconds / 3600 : null,
  }));

export type ProviderMetric = "healthyFirst" | "score" | "bitrate";

const PROVIDER_VALUE: Record<ProviderMetric, (p: Snapshot["providers"][number]) => number | null> = {
  healthyFirst: (p) => (p.rank1 ? (p.rank1Healthy / p.rank1) * 100 : null),
  score: (p) => p.score,
  bitrate: (p) => (p.bitrateKbps == null ? null : p.bitrateKbps / 1000),
};

/**
 * One series per provider seen anywhere in the range (a provider added or
 * removed part-way simply has gaps). Keys are `p0`, `p1`, … so odd names
 * cannot clash with `t`; `names` maps them back for the legend.
 */
export function providerRows(points: Snapshot[], metric: ProviderMetric): { rows: Row[]; series: { key: string; name: string }[] } {
  const names = [...new Set(points.flatMap((p) => p.providers.map((x) => x.name)))];
  const series = names.map((name, i) => ({ key: `p${i}`, name }));
  const rows = points.map((p) => {
    const row: Row = { t: p.t };
    for (const { key, name } of series) {
      const provider = p.providers.find((x) => x.name === name);
      row[key] = provider ? PROVIDER_VALUE[metric](provider) : null;
    }
    return row;
  });
  return { rows, series };
}

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const dayTime = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Axis labels: clock time over a day, dates beyond. */
export const tickFormatter = (range: HistoryRange) => (t: number) => (range === "24h" ? time.format(t) : day.format(t));

/** Tooltip heading for a point. */
export const pointLabel = (t: number) => dayTime.format(t);

/** Axis and tooltip formats for the Trends charts. */
export const formatPct = (v: number) => `${Math.round(v)}%`;
/** Hours as "45m" under an hour, else "2.5h". */
export const formatHours = (v: number) => (v < 1 ? `${Math.round(v * 60)}m` : `${Math.round(v * 10) / 10}h`);
