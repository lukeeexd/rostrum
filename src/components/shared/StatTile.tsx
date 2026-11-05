import type { ComponentType, ReactNode } from "react";
import type { Tone } from "@/lib/tone";
import { cx } from "@/utils/cx";
import { TONE_TEXT } from "./tone";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** BoardUI's plain stat card: icon tile, label, big value, optional caption. */
export function StatTile({
  icon: Icon,
  label,
  value,
  caption,
  tone,
  className,
}: {
  icon?: Icon;
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  /** Colours the value, for counts that are good or bad news. */
  tone?: Tone;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "flex min-h-[124px] min-w-0 flex-col justify-between gap-3 rounded-2xl bg-background-secondary-default p-4",
        className,
      )}
    >
      {Icon && (
        <span className="flex w-fit items-center rounded-md bg-stat-card-icon-background p-1.5">
          <Icon className="size-5 shrink-0 text-foreground-icon-primary" aria-hidden />
        </span>
      )}
      <div className="flex flex-col gap-0.5">
        <p className="truncate text-body-medium text-text-secondary">{label}</p>
        <p className={cx("text-title-1-medium whitespace-nowrap tabular-nums", tone ? TONE_TEXT[tone] : "text-text-primary")}>
          {value}
        </p>
        {caption && <p className="truncate text-body-2-medium text-text-tertiary">{caption}</p>}
      </div>
    </section>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid w-full grid-cols-2 gap-4 lg:grid-cols-4", className)}>{children}</div>;
}
