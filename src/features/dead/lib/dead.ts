import type { DeadEntry } from "@/api/types";
import type { Tone } from "@/lib/tone";

export type DeadFilter = "all" | "dead" | "black";

/**
 * Worst first: streams serving a channel first (rank 1) matter most, then
 * long streaks, then the most recent verdict.
 */
export function sortEntries(entries: DeadEntry[]): DeadEntry[] {
  const bestRank = (e: DeadEntry) => Math.min(Infinity, ...e.channels.map((c) => c.rank));
  return [...entries].sort(
    (a, b) => bestRank(a) - bestRank(b) || b.deadStreak - a.deadStreak || b.probedAt - a.probedAt,
  );
}

export function filterEntries(entries: DeadEntry[], filter: DeadFilter, query: string): DeadEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      (!q ||
        e.name.toLowerCase().includes(q) ||
        e.provider.toLowerCase().includes(q) ||
        e.channels.some((c) => c.name.toLowerCase().includes(q))),
  );
}

/** One failed check can be a blip; repeated ones are a pattern. */
export const streakTone = (streak: number): Tone => (streak >= 5 ? "bad" : streak >= 2 ? "warn" : "neutral");
