import type { SoakProviderSummary, SoakTally, SoakVerdict } from "@/api/types";
import { bestIndexes, type Better } from "@/lib/best";
import { formatInt, formatMs, formatPercent } from "@/lib/format";
import { notClean } from "@/lib/soak";
import type { Tone } from "@/lib/tone";

export const VERDICT_LABEL: Record<SoakVerdict, string> = { clean: "Clean", dropped: "Dropped", unreachable: "Unreachable" };
export const VERDICT_TONE: Record<SoakVerdict, Tone> = { clean: "good", dropped: "warn", unreachable: "bad" };

/** Share of soaks that were clean: ≥90% good, ≥70% a warning, below that bad. */
export function cleanTone(t: SoakTally): Tone | undefined {
  if (!t.soaks) return undefined;
  const share = t.clean / t.soaks;
  return share >= 0.9 ? "good" : share >= 0.7 ? "warn" : "bad";
}

/** "12 · 25%": a count with its share of the soaks run. */
export const countWithShare = (n: number, t: SoakTally) => (n ? `${formatInt(n)} · ${formatPercent(n, t.soaks)}` : "0");

/** One column of the provider table: what it shows, and which way is best. */
export interface ProviderColumn {
  id: string;
  label: string;
  text: (p: SoakProviderSummary) => string;
  /** The number compared across providers, when the column is marked. */
  value?: (p: SoakProviderSummary) => number | null;
  better?: Better;
}

const share = (n: number, p: SoakProviderSummary) => (p.soaks ? n / p.soaks : null);
/** Holds are compared in whole seconds, so a millisecond's difference does not mark a "best". */
const seconds = (ms: number | null) => (ms == null ? null : Math.round(ms / 1000));

export const PROVIDER_COLUMNS: ProviderColumn[] = [
  // "54", or "60 · 54 streams" once some streams have been soaked more than once.
  { id: "soaks", label: "Soaks", text: (p) => (p.soaks === p.streams ? formatInt(p.soaks) : `${formatInt(p.soaks)} · ${formatInt(p.streams)} streams`) },
  { id: "clean", label: "Clean", text: (p) => countWithShare(p.clean, p), value: (p) => share(p.clean, p), better: "high" },
  { id: "dropped", label: "Dropped", text: (p) => countWithShare(p.dropped, p), value: (p) => share(p.dropped, p), better: "low" },
  {
    id: "unreachable",
    label: "Unreachable",
    text: (p) => countWithShare(p.unreachable, p),
    value: (p) => share(p.unreachable, p),
    better: "low",
  },
  { id: "held", label: "Median held", text: (p) => formatMs(p.medianHeldMs), value: (p) => seconds(p.medianHeldMs), better: "high" },
  { id: "drops", label: "Drops", text: (p) => formatInt(p.drops), value: (p) => p.drops, better: "low" },
];

/** For each marked column, the providers holding its best value (none when all tie). */
export function bestByColumn(providers: SoakProviderSummary[]): Map<string, Set<number>> {
  return new Map(
    PROVIDER_COLUMNS.map((c) => [c.id, c.value ? bestIndexes(providers.map(c.value), c.better) : new Set<number>()]),
  );
}

/** "3 of 4 soaks not clean · 9 drops". */
export function failingSummary(s: SoakTally & { drops: number }): string {
  const bad = notClean(s);
  const drops = s.drops ? ` · ${formatInt(s.drops)} ${s.drops === 1 ? "drop" : "drops"}` : "";
  return `${formatInt(bad)} of ${formatInt(s.soaks)} ${s.soaks === 1 ? "soak" : "soaks"} not clean${drops}`;
}
