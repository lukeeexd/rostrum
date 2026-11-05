import { RiErrorWarningLine, RiInformationLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

const STYLES = {
  info: "bg-status-blue-background text-status-blue-text",
  warn: "bg-status-yellow-background text-status-yellow-text",
  bad: "bg-status-rose-background text-status-rose-text",
} as const;

/** A full-width inline banner for states the user should know about. */
export function Notice({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: keyof typeof STYLES;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? RiInformationLine : RiErrorWarningLine;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx("flex items-start gap-2 rounded-2lg px-3 py-2.5 text-body-medium", STYLES[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
