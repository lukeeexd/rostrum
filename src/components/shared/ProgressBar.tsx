import { Meter, ProgressBar as AriaProgressBar } from "react-aria-components";
import type { Tone } from "@/lib/tone";
import { cx } from "@/utils/cx";
import { TONE_FILL } from "./tone";

/**
 * BoardUI has no progress bar, so this is react-aria's ProgressBar (work in
 * flight) or Meter (a level, e.g. health) in BoardUI's chart-track colours.
 */
export function ProgressBar({
  label,
  value,
  max = 100,
  valueLabel,
  tone = "accent",
  kind = "progress",
  hideLabel,
  className,
}: {
  label: string;
  value: number;
  max?: number;
  /** Text shown on the right; defaults to the percentage. */
  valueLabel?: string;
  tone?: Tone;
  kind?: "progress" | "meter";
  hideLabel?: boolean;
  className?: string;
}) {
  const Root = kind === "meter" ? Meter : AriaProgressBar;
  return (
    <Root
      value={Math.min(value, max)}
      minValue={0}
      maxValue={max || 1}
      valueLabel={valueLabel}
      aria-label={label}
      className={cx("flex w-full flex-col gap-1.5", className)}
    >
      {({ percentage, valueText }: { percentage?: number; valueText?: string }) => (
        <>
          {!hideLabel && (
            <div className="flex items-baseline justify-between gap-2 text-body-2-medium">
              <span className="truncate text-text-secondary">{label}</span>
              <span className="shrink-0 text-text-primary tabular-nums">{valueText}</span>
            </div>
          )}
          <div className="h-2 w-full overflow-hidden rounded-full bg-chart-track">
            <div
              className={cx("h-full rounded-full transition-[width] duration-500 ease-out", TONE_FILL[tone])}
              style={{ width: `${percentage ?? 0}%` }}
            />
          </div>
        </>
      )}
    </Root>
  );
}
