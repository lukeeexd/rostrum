/** Which way a row's numbers are good, for marking the best provider. */
export type Better = "high" | "low";

/**
 * Indexes of the providers with the best value on a row. Nothing is marked
 * when fewer than two providers have a reading, or when they all tie.
 */
export function bestIndexes(values: (number | null)[], better: Better | undefined): Set<number> {
  if (!better) return new Set();
  const known = values.flatMap((v, i) => (v == null ? [] : [[v, i] as const]));
  if (known.length < 2) return new Set();
  const target = better === "high" ? Math.max(...known.map(([v]) => v)) : Math.min(...known.map(([v]) => v));
  if (known.every(([v]) => v === target)) return new Set();
  return new Set(known.filter(([v]) => v === target).map(([, i]) => i));
}
