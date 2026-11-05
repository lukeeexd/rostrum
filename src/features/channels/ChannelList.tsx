import { RiArrowRightSLine } from "@remixicon/react";
import { useState, type ReactNode } from "react";
import type { ChannelGroup, ChannelSummary } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { SearchBox } from "@/components/shared/SearchBox";
import { Chip } from "@/components/ui/badges/chip";
import { cx } from "@/utils/cx";
import { GroupRecheck } from "./GroupRecheck";
import { filterGroups, groupOf } from "./lib/groups";

/**
 * Dispatcharr's channel groups, each opening to its channels. Selecting a
 * channel is reported up. On narrow screens the parent passes the selected
 * channel's streams as `inline`, rendered under its row, and a second click
 * on the selected row closes it again.
 */
export function ChannelList({
  groups,
  selected,
  onSelect,
  inline,
  className,
}: {
  groups: ChannelGroup[];
  selected: number | null;
  onSelect: (channelId: number | null) => void;
  /** Narrow layout: what to show under the selected channel. Omitted on wide screens. */
  inline?: ReactNode;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  // Start with the selected channel's group open, so a shared link lands on it.
  const [open, setOpen] = useState<Set<number>>(() => {
    const g = selected == null ? undefined : groupOf(groups, selected);
    return new Set(g ? [g.id] : []);
  });
  const visible = filterGroups(groups, query);
  const searching = query.trim() !== "";
  const collapsible = inline !== undefined;

  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Card
      title={`Groups · ${groups.length}`}
      className={className}
      actions={<SearchBox label="Find a channel" value={query} onChange={setQuery} inputClassName="w-36" />}
    >
      {visible.length === 0 ? (
        <Empty>{groups.length === 0 ? "Dispatcharr has no channel groups." : "No group or channel matches."}</Empty>
      ) : (
        <ul className="-mx-1 flex flex-col gap-1">
          {visible.map((g) => {
            const isOpen = searching || open.has(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(g.id)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-start outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <RiArrowRightSLine
                    className={cx("size-4 shrink-0 text-foreground-icon-secondary transition-transform", isOpen && "rotate-90")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{g.name}</span>
                  <span className="shrink-0 text-caption-1-medium text-text-tertiary tabular-nums">{g.channels.length}</span>
                </button>
                {isOpen && (
                  <ul className="mt-0.5 mb-1 flex flex-col gap-0.5 ps-6">
                    <li>
                      <GroupRecheck groupId={g.id} groupName={g.name} channels={g.channels.length} />
                    </li>
                    {g.channels.length === 0 && <li className="px-2 py-1 text-body-2-medium text-text-tertiary">No channels.</li>}
                    {g.channels.map((c) => (
                      <ChannelRow
                        key={c.id}
                        channel={c}
                        selected={c.id === selected}
                        onClick={() => onSelect(c.id === selected && collapsible ? null : c.id)}
                      >
                        {c.id === selected && inline}
                      </ChannelRow>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ChannelRow({
  channel,
  selected,
  onClick,
  children,
}: {
  channel: ChannelSummary;
  selected: boolean;
  onClick: () => void;
  /** Rendered under the row (the narrow layout's open panel). */
  children?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onClick}
        className={cx(
          "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-start text-body-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          selected
            ? "bg-linear-to-b from-accent-500 to-accent-600 text-white shadow-nav-selected"
            : "text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{channel.name}</span>
        <Chip variant="caption" color={selected ? "soft" : "neutral"} className="shrink-0 tabular-nums">
          {channel.assigned} {channel.assigned === 1 ? "stream" : "streams"}
        </Chip>
      </button>
      {children && <div className="mt-2 mb-3 -ms-6">{children}</div>}
    </li>
  );
}
