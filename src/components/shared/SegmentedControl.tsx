import type { ComponentType } from "react";
import { ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";
import { cx } from "@/utils/cx";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface SegmentOption<T extends string> {
  id: T;
  /** Visible text; omit for an icon-only segment (then `ariaLabel` is required). */
  label?: string;
  ariaLabel?: string;
  icon?: Icon;
}

/**
 * Single-choice segmented control in BoardUI's look, on react-aria's
 * ToggleButtonGroup (arrow-key navigation, one selection always held).
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  className?: string;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys: Set<Key>) => {
        const [next] = keys;
        if (next !== undefined) onChange(next as T);
      }}
      className={cx("flex h-8 w-fit items-center gap-0.5 rounded-full bg-segmented-control-background p-0.5", className)}
    >
      {options.map(({ id, label: text, ariaLabel, icon: Icon }) => (
        <ToggleButton
          key={id}
          id={id}
          aria-label={ariaLabel}
          className={({ isSelected, isFocusVisible }) =>
            cx(
              "flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full text-body-medium outline-none transition-colors",
              text ? "px-3" : "w-7",
              isSelected
                ? "bg-segmented-control-selected-background text-text-primary shadow-xs"
                : "text-text-secondary hover:text-text-primary",
              isFocusVisible && "ring-2 ring-border-focus-ring",
            )
          }
        >
          {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
          {text}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
