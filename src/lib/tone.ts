import { percent } from "./format";

/** What a value means, independent of colour: shared by chips, bars, stat values. */
export type Tone = "neutral" | "accent" | "good" | "warn" | "bad";

/** ≥90% healthy is good, ≥70% a warning, below that bad. Nothing to measure is neutral. */
export function healthTone(healthy: number, total: number): Tone {
  if (total <= 0) return "neutral";
  const p = percent(healthy, total);
  return p >= 90 ? "good" : p >= 70 ? "warn" : "bad";
}
