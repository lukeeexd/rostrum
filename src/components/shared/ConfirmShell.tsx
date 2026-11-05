import type { ReactNode } from "react";
import { useFollowFocus } from "@/hooks/useFollowFocus";
import { errorText } from "@/lib/errors";
import { cx } from "@/utils/cx";

/**
 * The outside of every "ask, then queue" control (the re-checks and the
 * soaks): a named group that keeps focus as its buttons change, backs out on
 * Escape, announces its status, and shows what went wrong. The control puts
 * its own buttons inside.
 */
export function ConfirmShell({
  label,
  flow,
  status,
  statusFirst,
  className,
  children,
}: {
  /** The group's accessible name, e.g. "Re-check Arena Sports Golf". */
  label: string;
  flow: { confirming: boolean; keep: () => void; error: Error | null };
  /** Announced as it changes: the question while confirming, or what happened. */
  status?: string;
  /** Show the status before the buttons (a question) rather than after (a result). */
  statusFirst?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useFollowFocus<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      role="group"
      aria-label={label}
      className={cx("inline-flex flex-wrap items-center gap-1.5 text-body-2-medium", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && flow.confirming) {
          e.stopPropagation();
          flow.keep();
        }
      }}
    >
      {/* Always present, so a change of text is announced. */}
      <span role="status" className={cx(statusFirst ? "order-first text-text-secondary" : "text-text-tertiary", !status && "sr-only")}>
        {status}
      </span>
      {children}
      {flow.error && (
        <span role="alert" className="text-status-rose-text">
          {errorText(flow.error)}
        </span>
      )}
    </span>
  );
}
