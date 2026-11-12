import type { FlakyProvider, ProviderStats, ResolutionBucket, StreamState } from "@/api/types";
import type { Better } from "@/lib/best";
import { FLAKY_FLIPS } from "@/lib/flips";
import { formatInt, formatKbps, formatPercent, formatSeconds } from "@/lib/format";


export interface Row {
  id: string;
  label: string;
  /** Shown under the label. */
  hint?: string;
  /** The number compared across providers; null when a provider has no reading. */
  value: (p: ProviderStats) => number | null;
  /** How the cell reads; defaults to the formatted value. */
  display?: (p: ProviderStats) => string;
  format?: (v: number) => string;
  better?: Better;
}

export interface Section {
  id: string;
  title: string;
  rows: Row[];
}

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((n, v) => n + v, 0);
const share = (part: number | null, whole: number | null) => (part == null || !whole ? null : part / whole);
const withShare = (n: number, whole: number) => `${formatInt(n)} · ${formatPercent(n, whole)}`;

const RESOLUTION_LABEL: Record<ResolutionBucket, string> = { uhd: "UHD", fhd: "1080p", hd: "720p", sd: "SD", unknown: "Unknown" };

/** A stream-state row, read as a share of the provider's own managed streams. */
const stateRow = (state: StreamState, label: string, better?: Better): Row => ({
  id: state,
  label,
  value: (p) => share(p.streams[state], sum(p.streams)),
  display: (p) => withShare(p.streams[state], sum(p.streams)),
  better,
});

function rank1Health(p: ProviderStats): string {
  const s = share(p.rank1Healthy, p.rank1Channels);
  return s == null ? "—" : `${Math.round(s * 100)}% · ${formatInt(p.rank1Healthy)} of ${formatInt(p.rank1Channels)}`;
}

/** The range the stability row covers (the Flaky streams page can show others). */
export const STABILITY_RANGE = "30d";

/** Flaky streams as a row: a provider the probe log has no streams for has no reading. */
function flakyRow(flaky: FlakyProvider[]): Row {
  const of = (p: ProviderStats) => flaky.find((f) => f.name === p.name);
  return {
    id: "flaky",
    label: "Flaky streams",
    hint: `flipped between playable and broken ${FLAKY_FLIPS}+ times in 30 days`,
    value: (p) => of(p)?.share ?? null,
    display: (p) => {
      const f = of(p);
      return f?.share == null ? "—" : withShare(f.flaky, f.probed);
    },
    better: "low",
  };
}

/**
 * The comparison, top to bottom: who serves channels first and how well,
 * then what their streams are like (and, from Rostrum's probe log when it
 * has one, how steady they are), then why the broken ones broke.
 * Dead-reason rows are built from whichever reasons any provider reports.
 */
export function comparisonSections(providers: ProviderStats[], flaky?: FlakyProvider[] | null): Section[] {
  const reasons = [...new Set(providers.flatMap((p) => Object.keys(p.deadReasons)))].sort();

  const sections: Section[] = [
    {
      id: "first",
      title: "Serving first",
      rows: [
        { id: "rank1", label: "Channels served first", hint: "its stream is in slot 1", value: (p) => p.rank1Channels, better: "high" },
        { id: "rank1-healthy", label: "Healthy when first", value: (p) => share(p.rank1Healthy, p.rank1Channels), display: rank1Health, better: "high" },
        { id: "channels", label: "Channels carried", hint: "in any slot", value: (p) => p.channels, better: "high" },
        {
          id: "score",
          label: "Median score",
          hint: "Podium's 0–1 ranking score",
          // Compared at the precision shown, so 0.51 and 0.511 tie instead of one "winning" invisibly.
          value: (p) => (p.score == null ? null : Math.round(p.score * 100) / 100),
          format: (v) => v.toFixed(2),
          better: "high",
        },
      ],
    },
    {
      id: "health",
      title: "Stream health",
      rows: [
        { id: "total", label: "Managed streams", value: (p) => sum(p.streams) },
        stateRow("alive", "Alive", "high"),
        stateRow("low_bitrate", "Low bitrate", "low"),
        stateRow("black", "Black screen", "low"),
        stateRow("dead", "Dead", "low"),
        { id: "unmeasured", label: "Not measured yet", value: (p) => p.streams.unmeasured },
      ],
    },
    ...(flaky?.length ? [{ id: "stability", title: "Stability", rows: [flakyRow(flaky)] }] : []),
    {
      id: "bitrate",
      title: "Median bitrate",
      rows: [
        ...(["all", "uhd", "fhd", "hd", "sd"] as const).map(
          (r): Row => ({
            id: `br-${r}`,
            label: r === "all" ? "All streams" : RESOLUTION_LABEL[r],
            value: (p) => p.bitrateKbps[r] ?? null,
            format: formatKbps,
            better: "high",
          }),
        ),
        { id: "measured", label: "Measured, not declared", value: (p) => p.bitrateMeasured },
      ],
    },
    {
      id: "resolution",
      title: "Resolution mix",
      rows: (Object.keys(RESOLUTION_LABEL) as ResolutionBucket[]).map(
        (r): Row => ({
          id: `res-${r}`,
          label: RESOLUTION_LABEL[r],
          value: (p) => p.resolutions[r],
          display: (p) => withShare(p.resolutions[r], sum(p.resolutions)),
        }),
      ),
    },
    {
      id: "freshness",
      title: "Freshness and limits",
      rows: [
        { id: "age-median", label: "Typical verdict age", value: (p) => p.verdictAgeSeconds.median, format: formatSeconds, better: "low" },
        { id: "age-max", label: "Oldest verdict", value: (p) => p.verdictAgeSeconds.max, format: formatSeconds, better: "low" },
        { id: "limit", label: "Connection limit", hint: "streams at once", value: (p) => p.maxStreams },
      ],
    },
  ];

  if (reasons.length) {
    sections.push({
      id: "dead-reasons",
      title: "Why dead streams died",
      rows: reasons.map(
        (r): Row => ({
          id: `dead-${r}`,
          label: r.replace(/_/g, " "),
          hint: r === "probe_error" ? "Podium's side, not the provider's" : undefined,
          value: (p) => p.deadReasons[r] ?? 0,
          better: "low",
        }),
      ),
    });
  }
  return sections;
}


export const cellText = (row: Row, p: ProviderStats): string => {
  if (row.display) return row.display(p);
  const v = row.value(p);
  return v == null ? "—" : (row.format ?? formatInt)(v);
};
