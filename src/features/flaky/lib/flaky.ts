import type { FlakyProvider, FlakyStream } from "@/api/types";
import { plural } from "@/lib/format";
import type { Tone } from "@/lib/tone";

/** Streams whose name, provider or channel contains the query (case-insensitive); everything for a blank query. */
export function filterFlaky(streams: FlakyStream[], query: string): FlakyStream[] {
  const q = query.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter((s) => [s.name, s.provider, s.channelName].some((v) => v?.toLowerCase().includes(q)));
}

/** "4 flips · 31 probes". */
export const flipsAndProbes = (s: Pick<FlakyStream, "flips" | "probes">) => `${plural(s.flips, "flip")} · ${plural(s.probes, "probe")}`;

/** "4 flips · 31 probes · broken 22% of the time". */
export function flakySummary(s: Pick<FlakyStream, "flips" | "probes" | "brokenShare">): string {
  const broken = s.brokenShare == null ? "" : ` · broken ${Math.round(s.brokenShare * 100)}% of the time`;
  return flipsAndProbes(s) + broken;
}

/** A provider's flaky share, coloured: none is good, up to one in twenty is a watch, more is bad. */
export function shareTone(p: Pick<FlakyProvider, "share">): Tone | undefined {
  if (p.share == null) return undefined;
  return p.share === 0 ? "good" : p.share <= 0.05 ? "warn" : "bad";
}
