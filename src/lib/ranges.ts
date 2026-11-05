/** The ranges Rostrum's own records (Trends, the soak log) can be read over; server/history.ts RANGE_MS must match. */
export const HISTORY_RANGES = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
] as const;

/** "24 hours", for a range id. */
export const rangeLabel = (id: string) => HISTORY_RANGES.find((r) => r.id === id)?.label ?? id;
