import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiSignalWifiErrorLine,
  RiTvLine,
} from "@remixicon/react";
import { Link } from "react-router";
import { useConnectEvents, useStats, useWorker } from "@/api/queries";
import type { ConnectEventsResponse, Stats } from "@/api/types";
import { Card, Empty, Fact } from "@/components/shared/Card";
import { Notice } from "@/components/shared/Notice";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { CardSkeleton, QueryState } from "@/components/shared/QueryState";
import { StatGrid, StatTile } from "@/components/shared/StatTile";
import { ToneChip } from "@/components/shared/tone";
import { WorkerNotice } from "@/components/shared/WorkerNotice";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt, formatPercent, formatSeconds, percent } from "@/lib/format";
import { healthTone } from "@/lib/tone";
import { ConnectEventList } from "@/features/connect/ConnectEvents";
import { connectTone, CONNECT_LABEL } from "./lib/health";

export function OverviewPage() {
  const stats = useStats();
  const { worker } = useWorker();

  return (
    <>
      <WorkerNotice worker={worker} />
      <QueryState query={stats}>{(s) => <OverviewBody stats={s} />}</QueryState>
    </>
  );
}

function OverviewBody({ stats }: { stats: Stats }) {
  const { streams, primary, freshness } = stats;
  return (
    <>
      <StatGrid>
        <StatTile
          icon={RiCheckboxCircleLine}
          label="Healthy streams"
          value={formatInt(streams.healthy)}
          caption={`of ${formatInt(streams.total)} · ${formatInt(streams.states.unmeasured)} not yet measured`}
        />
        <StatTile
          icon={RiCloseCircleLine}
          label="Dead"
          value={formatInt(streams.states.dead)}
          tone={streams.states.dead ? "bad" : undefined}
          caption="Did not answer a probe"
        />
        <StatTile
          icon={RiTvLine}
          label="Black screen"
          value={formatInt(streams.states.black)}
          tone={streams.states.black ? "bad" : undefined}
          caption="Alive, but showing a slate"
        />
        <StatTile
          icon={RiSignalWifiErrorLine}
          label="Low bitrate"
          value={formatInt(streams.states.low_bitrate)}
          tone={streams.states.low_bitrate ? "warn" : undefined}
          caption="Below the bitrate floor"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Channels served first by a healthy stream">
          <p className="text-display-4-medium text-text-primary tabular-nums">
            {formatPercent(primary.healthy, primary.total)}
          </p>
          <ProgressBar
            kind="meter"
            label="Healthy first streams"
            value={primary.healthy}
            max={primary.total}
            valueLabel={`${formatInt(primary.healthy)} of ${formatInt(primary.total)}`}
            tone={healthTone(primary.healthy, primary.total)}
          />
        </Card>
        <FreshnessCard freshness={freshness} />
        <ConnectCard />
      </div>

      <Card title="Providers">
        {stats.providers.length === 0 ? (
          <Empty>No providers have primary streams yet.</Empty>
        ) : (
          <Table aria-label="Provider health" size="sm">
            <TableHeader>
              {/* Fixed name/number widths; the health bar takes whatever is left. */}
              <TableColumn isRowHeader className="w-56">Provider</TableColumn>
              <TableColumn className="num w-32">Serving first</TableColumn>
              <TableColumn className="num w-32">Healthy</TableColumn>
              <TableColumn className="ps-8!">Health</TableColumn>
            </TableHeader>
            <TableBody items={stats.providers.map((p, i) => ({ id: `${i}-${p.name}`, ...p }))}>
              {(p) => (
                <TableRow>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="num">{formatInt(p.primary)}</TableCell>
                  <TableCell className="num">{formatInt(p.healthy)}</TableCell>
                  <TableCell className="ps-8!">
                    <ProgressBar
                      kind="meter"
                      hideLabel
                      label={`${p.name} health`}
                      value={p.healthy}
                      max={p.primary}
                      tone={healthTone(p.healthy, p.primary)}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function FreshnessCard({ freshness }: { freshness: Stats["freshness"] }) {
  const { oldestProbeAgeSeconds: oldest, targetSeconds: target, breaching } = freshness;
  return (
    <Card
      title="Freshness"
      actions={<ToneChip tone={breaching ? "bad" : "good"}>{breaching ? "Behind target" : "Within target"}</ToneChip>}
    >
      <p className="text-display-4-medium text-text-primary tabular-nums">{formatSeconds(oldest)}</p>
      <ProgressBar
        kind="meter"
        label="Oldest check vs target"
        value={oldest ?? 0}
        max={target}
        valueLabel={`target ${formatSeconds(target)}`}
        tone={breaching ? "bad" : percent(oldest ?? 0, target) > 75 ? "warn" : "good"}
      />
      <p className="text-body-2-medium text-text-tertiary">Age of the oldest measurement still in service.</p>
    </Card>
  );
}

function ConnectCard() {
  const connect = useConnectEvents();
  const state = connect.data?.status.state;
  return (
    <Card
      title="Dispatcharr Connect"
      actions={state && <ToneChip tone={connectTone(state)} dot>{CONNECT_LABEL[state]}</ToneChip>}
    >
      <QueryState query={connect} skeleton={<CardSkeleton />}>
        {(c) => <ConnectBody connect={c} />}
      </QueryState>
    </Card>
  );
}

function ConnectBody({ connect }: { connect: ConnectEventsResponse }) {
  const now = useNow(10_000);
  const { summary } = connect.status;
  if (!connect.status.enabled) {
    return <Empty>Connect is off. Podium only learns of changes on its own passes.</Empty>;
  }
  const rows: [string, string][] = [
    ["Events accepted", formatInt(summary.accepted)],
    ["Rejected", formatInt(summary.rejected)],
    ["Last event", formatAgo(summary.lastReceivedAt, now)],
    ["Last sync", formatAgo(summary.lastSyncAt, now)],
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </dl>
      {summary.syncError && <Notice tone="bad">{summary.syncError}</Notice>}
      <LatestEvents events={connect.events} now={now} />
    </>
  );
}

/** How many events the Overview card shows; the rest are on History. */
const LATEST_EVENTS = 3;

function LatestEvents({ events, now }: { events: ConnectEventsResponse["events"]; now: number }) {
  if (!events.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption-1-medium text-text-tertiary">Latest events</h3>
        <Link
          to="/history"
          className="rounded-sm text-caption-1-medium text-text-tertiary underline underline-offset-2 outline-none hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          {events.length > LATEST_EVENTS ? `See all ${events.length}` : "On History"}
        </Link>
      </div>
      <ConnectEventList events={events.slice(0, LATEST_EVENTS)} now={now} />
    </div>
  );
}
