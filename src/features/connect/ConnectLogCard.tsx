import { useState, type ReactNode } from "react";
import { useConnectEvents, useConnectLog } from "@/api/queries";
import type { ConnectLogResponse, HistoryRange, SwitchedChannel, SwitchedStream } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { ChannelLink } from "@/components/shared/ChannelLink";
import { Paged } from "@/components/shared/Paged";
import { CardSkeleton, QueryState } from "@/components/shared/QueryState";
import { Row, RowList } from "@/components/shared/RowList";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt, orUnnamed } from "@/lib/format";
import { HISTORY_RANGES, rangeLabel } from "@/lib/ranges";
import { ConnectEventList } from "./ConnectEvents";
import { streamLabel } from "./lib/events";

const TABS = [
  { id: "events", label: "Events" },
  { id: "streams", label: "Streams" },
  { id: "channels", label: "Channels" },
  { id: "providers", label: "Providers" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const NO_EVENTS = "Dispatcharr sends one when a stream fails or is switched while someone is watching.";

/**
 * The History page's Connect card: Rostrum's own log of Connect events over
 * a range, and which streams, channels and providers they fall on. Without a
 * history database it shows the 25 Podium keeps instead.
 */
export function ConnectLogCard() {
  const [range, setRange] = useState<HistoryRange>("7d");
  const [tab, setTab] = useState<Tab>("events");
  const log = useConnectLog(range);
  const off = log.data && !log.data.enabled;

  return (
    <Card
      title="Dispatcharr Connect events"
      actions={
        !off && (
          <>
            <SegmentedControl<HistoryRange> label="Range" value={range} onChange={setRange} options={HISTORY_RANGES} />
            <SegmentedControl<Tab> label="View" value={tab} onChange={setTab} options={TABS} />
          </>
        )
      }
    >
      {off ? (
        <PodiumRecent reason={log.data?.reason} />
      ) : (
        <QueryState query={log} skeleton={<CardSkeleton />}>
          {/* A new range or tab starts its list from the first page again. */}
          {(data) => <LogBody key={`${range}-${tab}`} data={data} tab={tab} />}
        </QueryState>
      )}
    </Card>
  );
}

function LogBody({ data, tab }: { data: ConnectLogResponse; tab: Tab }) {
  const now = useNow(30_000);
  if (data.total === 0) return <Empty>No events in the last {rangeLabel(data.range)}. {NO_EVENTS}</Empty>;
  return (
    <>
      {tab === "events" && <Paged items={data.events}>{(events) => <ConnectEventList events={events} now={now} />}</Paged>}
      {tab === "streams" && (
        <Ranking items={data.streams} label="Streams switched away from most" now={now}>
          {(s) => <StreamName stream={s} />}
        </Ranking>
      )}
      {tab === "channels" && (
        <Ranking items={data.channels} label="Channels switched most" now={now}>
          {(c) => <ChannelName channel={c} />}
        </Ranking>
      )}
      {tab === "providers" && <ProvidersTable providers={data.providers} />}
      <p className="text-caption-1-medium text-text-tertiary">
        {formatInt(data.total)} {data.total === 1 ? "event" : "events"} in the last {rangeLabel(data.range)}
        {data.since != null && `; the oldest logged arrived ${formatAgo(data.since, now)}`}. Rankings count {formatInt(data.counted)}{" "}
        of them: switches made by hand and deliveries Podium rejected are listed but not counted.
      </p>
    </>
  );
}

/** A ranked, paged list: each row's name on the left, "N switches · last X ago" on the right. */
function Ranking<T extends { switches: number; lastAt: number }>({
  items,
  label,
  now,
  children,
}: {
  items: T[];
  label: string;
  now: number;
  children: (item: T) => ReactNode;
}) {
  if (items.length === 0) return <Empty>Nothing counted in this range.</Empty>;
  return (
    <Paged items={items}>
      {(page) => (
        <RowList label={label} ordered>
          {page.map((item, i) => (
            <Row key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              {children(item)}
              <span className="shrink-0 text-body-2-medium text-text-secondary tabular-nums">
                {formatInt(item.switches)} {item.switches === 1 ? "switch" : "switches"}{" "}
                <span className="text-text-tertiary">· last {formatAgo(item.lastAt, now)}</span>
              </span>
            </Row>
          ))}
        </RowList>
      )}
    </Paged>
  );
}

function StreamName({ stream: s }: { stream: SwitchedStream }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="break-words text-body-semibold text-text-primary">{streamLabel(s)}</span>
      {s.channelName && (
        <span className="text-caption-1-medium text-text-tertiary">
          on {s.channelId != null ? <ChannelLink id={s.channelId} name={s.channelName} /> : s.channelName}
        </span>
      )}
    </span>
  );
}

function ChannelName({ channel: c }: { channel: SwitchedChannel }) {
  return (
    <span className="min-w-0 break-words text-body-semibold text-text-primary">
      {c.channelId != null ? <ChannelLink id={c.channelId} name={c.name} className="text-text-primary!" /> : c.name}
    </span>
  );
}

function ProvidersTable({ providers }: { providers: ConnectLogResponse["providers"] }) {
  if (providers.length === 0) return <Empty>Nothing counted in this range.</Empty>;
  return (
    <Table aria-label="Connect switches by provider" size="sm">
      <TableHeader>
        <TableColumn isRowHeader>Provider</TableColumn>
        <TableColumn className="num whitespace-nowrap">Switched away from</TableColumn>
        <TableColumn className="num whitespace-nowrap">Switched to</TableColumn>
      </TableHeader>
      <TableBody items={providers.map((p, i) => ({ id: `p${i}`, p }))}>
        {({ p }) => (
          <TableRow>
            <TableCell>{orUnnamed(p.name)}</TableCell>
            <TableCell className="num">{formatInt(p.from)}</TableCell>
            <TableCell className="num">{formatInt(p.to)}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Without a history database: the 25 events Podium itself keeps. */
function PodiumRecent({ reason }: { reason?: string }) {
  const query = useConnectEvents();
  const now = useNow(30_000);
  return (
    <QueryState query={query} skeleton={<CardSkeleton />}>
      {(data) =>
        !data.status.enabled ? (
          <Empty>Connect is off, so Dispatcharr is not telling Podium about failures as they happen.</Empty>
        ) : data.events.length === 0 ? (
          <Empty>No events in the last 14 days. {NO_EVENTS}</Empty>
        ) : (
          <>
            <ConnectEventList events={data.events} now={now} />
            <p className="text-caption-1-medium text-text-tertiary">
              Podium keeps the last 25 from the past 14 days. {reason} To keep them longer, give Rostrum a history database.
              {!data.named && " Stream names are unavailable right now, so ids are shown."}
            </p>
          </>
        )
      }
    </QueryState>
  );
}
