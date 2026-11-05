import type { ReactNode } from "react";
import { Chip } from "@/components/ui/badges/chip";
import type { Tone } from "@/lib/tone";
import { cx } from "@/utils/cx";

const CHIP: Record<Tone, "lime" | "rose" | "yellow" | "blue" | "neutral"> = {
  good: "lime",
  bad: "rose",
  warn: "yellow",
  accent: "blue",
  neutral: "neutral",
};

/** Bar fills and text accents for each tone. */
export const TONE_FILL: Record<Tone, string> = {
  good: "bg-green-500",
  bad: "bg-rose-500",
  warn: "bg-yellow-500",
  accent: "bg-accent-500",
  neutral: "bg-neutral-400",
};

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-status-lime-text",
  bad: "text-status-rose-text",
  warn: "text-status-yellow-text",
  accent: "text-status-blue-text",
  neutral: "text-text-secondary",
};

/** A status chip: BoardUI's Chip, coloured by meaning rather than hue. */
export function ToneChip({
  tone,
  children,
  dot,
  pulse,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
  /** Animate the dot, for "something is happening right now". */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <Chip variant="bold" color={CHIP[tone]} className={cx("gap-1.5", className)}>
      {dot && (
        <span className="relative flex size-2" aria-hidden>
          {pulse && <span className={cx("absolute inset-0 animate-ping rounded-full opacity-60", TONE_FILL[tone])} />}
          <span className={cx("relative size-2 rounded-full", TONE_FILL[tone])} />
        </span>
      )}
      {children}
    </Chip>
  );
}
