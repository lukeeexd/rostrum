import type { CacheHealth } from "@/api/types";
import { formatInt } from "@/lib/format";
import { cx } from "@/utils/cx";
import { cacheAgeSegments, type AgeSegment } from "./lib/cache";

const FILL: Record<AgeSegment["key"], string> = {
  hour: "bg-green-500",
  sixHours: "bg-accent-500",
  day: "bg-chart-9",
  older: "bg-yellow-500",
};

/** How old the cached verdicts are, as one stacked bar with a legend. */
export function CacheAgeBar({ ages }: { ages: CacheHealth["ages"] }) {
  const segments = cacheAgeSegments(ages);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-2-medium text-text-secondary">How old each verdict is</p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-chart-track"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        {segments.map((s) => s.pct > 0 && <div key={s.key} className={FILL[s.key]} style={{ width: `${s.pct}%` }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-body-2-medium">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className={cx("size-2 rounded-full", FILL[s.key])} aria-hidden />
              {s.label}
            </span>
            <span className={cx("tabular-nums", s.warn && s.count ? "text-status-yellow-text" : "text-text-primary")}>
              {formatInt(s.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
