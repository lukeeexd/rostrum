import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "@/utils/cx";

/** The Channels page with one channel open. */
export const channelHref = (id: number) => `/channels?channel=${id}`;

/** A link that opens a channel on the Channels page; by default its name, underlined. */
export function ChannelLink({ id, name, children, className }: { id: number; name?: string | null; children?: ReactNode; className?: string }) {
  return (
    <Link
      to={channelHref(id)}
      className={cx(
        "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        !children && "text-text-secondary underline underline-offset-2",
        className,
      )}
    >
      {children ?? (name || `Channel ${id}`)}
    </Link>
  );
}
