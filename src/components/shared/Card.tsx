import type { ReactNode } from "react";
import type { Tone } from "@/lib/tone";
import { cx } from "@/utils/cx";
import { TONE_TEXT } from "./tone";

/** BoardUI's card surface: a secondary-tinted panel with a quiet title row. */
export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("flex min-w-0 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4", className)}>
      {(title || actions) && (
        <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-body-medium text-text-secondary">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** The raised inner tile BoardUI puts inside cards. */
export function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 rounded-2lg bg-background-inner-default p-3 shadow-card", className)}>{children}</div>
  );
}

/** A labelled number in a tile. Render inside a <dl>. */
export function Fact({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: Tone }) {
  return (
    <Tile className="flex flex-col gap-0.5 p-2.5">
      <dt className="truncate text-caption-1-medium text-text-tertiary">{label}</dt>
      <dd className={cx("text-title-3-medium tabular-nums", tone ? TONE_TEXT[tone] : "text-text-primary")}>{value}</dd>
      {sub && <dd className="text-caption-1-medium text-text-tertiary">{sub}</dd>}
    </Tile>
  );
}

/** Quiet text for "nothing here" states. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-body-regular text-text-tertiary">{children}</p>;
}
