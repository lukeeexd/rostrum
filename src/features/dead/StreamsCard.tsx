import { useMemo, useState } from "react";
import type { DeadEntry, DeadResponse } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { SearchBox } from "@/components/shared/SearchBox";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Paged } from "@/components/shared/Paged";
import { Row, RowList } from "@/components/shared/RowList";
import { ToneChip } from "@/components/shared/tone";
import { Chip } from "@/components/ui/badges/chip";
import { formatAgo, formatInt } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/streamStatus";
import { filterEntries, sortEntries, streakTone, type DeadFilter } from "./lib/dead";

const PAGE = 50;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "dead", label: "Dead" },
  { id: "black", label: "Black" },
] as const;

/** Every dead or black stream, worst first, filterable and paged. */
export function StreamsCard({ data, now }: { data: DeadResponse; now: number }) {
  const [filter, setFilter] = useState<DeadFilter>("all");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => sortEntries(data.entries), [data.entries]);
  const visible = filterEntries(sorted, filter, query);

  const title = data.truncated
    ? `Streams · showing ${formatInt(data.entries.length)} of ${formatInt(data.entryTotal)}`
    : `Streams · ${formatInt(data.entryTotal)}`;

  return (
    <Card
      title={title}
      actions={
        <>
          <SearchBox label="Filter streams" placeholder="Stream, provider or channel" value={query} onChange={setQuery} />
          <SegmentedControl<DeadFilter> label="Status" value={filter} onChange={setFilter} options={FILTERS} />
        </>
      }
    >
      {visible.length === 0 ? (
        <Empty>{data.entries.length === 0 ? "No dead or black streams. Nice." : "Nothing matches this filter."}</Empty>
      ) : (
        // A new filter or search starts again from the first page.
        <Paged key={`${filter}\u0000${query}`} items={visible} page={PAGE}>
          {(page) => (
            <RowList label="Dead and black streams">
              {page.map((e) => (
                <EntryRow key={e.streamId} entry={e} now={now} />
              ))}
            </RowList>
          )}
        </Paged>
      )}
    </Card>
  );
}

function EntryRow({ entry: e, now }: { entry: DeadEntry; now: number }) {
  return (
    <Row roomy className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body-semibold text-text-primary">{e.name}</span>
          <ToneChip tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</ToneChip>
          {e.deadStreak >= 2 && <ToneChip tone={streakTone(e.deadStreak)}>dead for {e.deadStreak} checks</ToneChip>}
        </div>
        <p className="text-body-2-medium text-text-tertiary">
          {e.provider} · checked {formatAgo(e.probedAt, now)}
          {e.status === "black" && e.height > 0 && ` · ${e.height}p`}
          {e.error && ` · ${e.error}`}
        </p>
      </div>
      <ul aria-label="Channels" className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[45%] sm:justify-end">
        {e.channels.length === 0 ? (
          <li className="text-body-2-medium text-text-tertiary">on no channel</li>
        ) : (
          e.channels.map((c) => (
            <li key={c.id}>
              <Chip variant="caption" color={c.rank === 1 ? "rose" : "soft"} title={c.rank === 1 ? "Served first" : undefined}>
                {c.name} <span className="ms-1 tabular-nums opacity-70">#{c.rank}</span>
              </Chip>
            </li>
          ))
        )}
      </ul>
    </Row>
  );
}
