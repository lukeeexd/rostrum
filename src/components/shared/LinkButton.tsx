import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/utils/cx";

/** A button that reads as a quiet link, for actions repeated on every row of a list or table. */
export function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "rounded-sm text-caption-1-medium text-text-tertiary underline underline-offset-2 outline-none",
        "hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:opacity-50",
        className,
      )}
    />
  );
}
