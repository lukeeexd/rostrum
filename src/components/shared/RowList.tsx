import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

/** A list of rows divided by hairlines, as cards use for streams, channels and events. */
export function RowList({ label, ordered, children }: { label?: string; ordered?: boolean; children: ReactNode }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List aria-label={label} className="flex flex-col divide-y divide-separator-border">
      {children}
    </List>
  );
}

/** One row of a RowList; `roomy` for rows with more to say. */
export function Row({ roomy, className, children }: { roomy?: boolean; className?: string; children: ReactNode }) {
  return <li className={cx(roomy ? "py-3" : "py-2.5", "first:pt-0 last:pb-0", className)}>{children}</li>;
}
