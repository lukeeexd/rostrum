import type { CacheHealth } from "@/api/types";
import { percent } from "@/lib/format";

export interface AgeSegment {
  key: keyof CacheHealth["ages"];
  label: string;
  count: number;
  pct: number;
  /** Over a day old is past Podium's default freshness target. */
  warn: boolean;
}

const LABELS: Record<AgeSegment["key"], string> = {
  hour: "Under 1h",
  sixHours: "1–6h",
  day: "6–24h",
  older: "Over 24h",
};

/** The cache-age stacked bar, in age order. */
export function cacheAgeSegments(ages: CacheHealth["ages"]): AgeSegment[] {
  const total = ages.hour + ages.sixHours + ages.day + ages.older;
  return (Object.keys(LABELS) as AgeSegment["key"][]).map((key) => ({
    key,
    label: LABELS[key],
    count: ages[key],
    pct: percent(ages[key], total),
    warn: key === "older",
  }));
}
