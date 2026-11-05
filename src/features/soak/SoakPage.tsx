import { RiCheckboxCircleLine, RiCloseCircleLine, RiErrorWarningLine, RiTimerLine } from "@remixicon/react";
import { useState } from "react";
import { Link } from "react-router";
import { useSoaks } from "@/api/queries";
import type { HistoryRange, SoakProviderSummary, SoakRecord, SoakStreamSummary, SoaksResponse } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { ChannelLink } from "@/components/shared/ChannelLink";
import { Notice } from "@/components/shared/Notice";
import { QueryState } from "@/components/shared/QueryState";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Paged } from "@/components/shared/Paged";
import { Row, RowList } from "@/components/shared/RowList";
import { StatGrid, StatTile } from "@/components/shared/StatTile";
import { ToneChip } from "@/components/shared/tone";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt, formatMs, formatPercent, orUnnamed } from "@/lib/format";
import { HISTORY_RANGES, rangeLabel } from "@/lib/ranges";
import { formatSoak } from "@/lib/soak";
import { cx } from "@/utils/cx";
import { bestByColumn, cleanTone, failingSummary, PROVIDER_COLUMNS, VERDICT_LABEL, VERDICT_TONE } from "./lib/soak";

/**
 * Soak tests across the catalogue. Podium keeps only each stream's latest
 * soak, so Rostrum logs every result it sees (server/soaks.ts) and this page
 * reads that log: how many were clean, how each provider holds up, which
 * streams keep failing, and the latest results.
 */
export function SoakPage() {
  const [range, setRange] = useState<HistoryRange>("24h");
  const soaks = useSoaks(range);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<HistoryRange> label="Range" value={range} onChange={setRange} options={HISTORY_RANGES} />
        {soaks.data?.enabled && <Logging data={soaks.data} />}
      </div>
      <QueryState query={soaks}>{(data) => <SoakBody data={data} />}</QueryState>
    </>
  );
}

function Logging({ data }: { data: SoaksResponse }) {
  const now = useNow(60_000);
  return (
    <p className="px-1 text-body-2-medium text-text-tertiary">
      Every result Podium reports, checked every 5 minutes
      {data.since != null && `; the oldest logged finished ${formatAgo(data.since, now)}`}. Kept for 90 days
    </p>
  );
}

function SoakBody({ data }: { data: SoaksResponse }) {
  const now = useNow(30_000);
  if (!data.enabled) {
    return (
      <Notice tone="info">
        {data.reason} The soak log is kept in the same database as Trends. With Docker, the compose file in this repo sets{" "}
        <code>HISTORY_DB=/data/rostrum.db</code> on a <code>rostrum-data</code> volume for you.
      </Notice>
    );
  }
  const { totals } = data;
  if (totals.soaks === 0) {
    return (
      <Card>
        <Empty>
          No soak tests finished in the last {rangeLabel(data.range)}
          {data.since == null ? ", or Rostrum has not checked yet (it does within a few seconds of starting)" : ""}. Podium
          runs them in its soak window, or sooner when one is queued by hand; what is waiting is on the{" "}
          <Link to="/live" className="text-text-primary underline underline-offset-2">
            Live pass
          </Link>{" "}
          page.
        </Empty>
      </Card>
    );
  }

  return (
    <>
      <StatGrid>
        <StatTile
          icon={RiTimerLine}
          label="Soak tests"
          value={formatInt(totals.soaks)}
          caption={`on ${formatInt(totals.streams)} ${totals.streams === 1 ? "stream" : "streams"}`}
        />
        <StatTile
          icon={RiCheckboxCircleLine}
          label="Clean"
          value={formatPercent(totals.clean, totals.soaks)}
          tone={cleanTone(totals)}
          caption={`${formatInt(totals.clean)} held with no drops`}
        />
        <StatTile
          icon={RiErrorWarningLine}
          label="Dropped"
          value={formatInt(totals.dropped)}
          tone={totals.dropped ? "warn" : undefined}
          caption="Dropped or redialled"
        />
        <StatTile
          icon={RiCloseCircleLine}
          label="Unreachable"
          value={formatInt(totals.unreachable)}
          tone={totals.unreachable ? "bad" : undefined}
          caption="Could not connect"
        />
      </StatGrid>

      {/* Wide: providers and the latest soaks stacked on the left, the failing streams down the right. */}
      <div className="grid items-start gap-4 2xl:grid-cols-2">
        <ProvidersCard providers={data.providers} />
        <FailingCard
          key={data.range}
          failing={data.failing}
          now={now}
          className="2xl:col-start-2 2xl:row-span-2 2xl:row-start-1"
        />
        <RecentCard recent={data.recent} total={totals.soaks} now={now} />
      </div>
    </>
  );
}

function ProvidersCard({ providers }: { providers: SoakProviderSummary[] }) {
  const best = bestByColumn(providers);
  return (
    <Card title="By provider">
      <Table aria-label="Soak results by provider" size="sm">
        <TableHeader>
          <TableColumn isRowHeader>Provider</TableColumn>
          {PROVIDER_COLUMNS.map((c) => (
            <TableColumn key={c.id} className="num whitespace-nowrap">
              {c.label}
            </TableColumn>
          ))}
        </TableHeader>
        <TableBody items={providers.map((p, index) => ({ id: `p${index}`, p, index }))}>
          {({ p, index }) => (
            <TableRow>
              <TableCell>{orUnnamed(p.name)}</TableCell>
              {PROVIDER_COLUMNS.map((c) => {
                const isBest = best.get(c.id)!.has(index);
                return (
                  <TableCell key={c.id} className={cx("num relative whitespace-nowrap", isBest && "font-semibold! text-status-lime-text!")}>
                    {isBest && <span className="sr-only">Best: </span>}
                    {c.text(p)}
                  </TableCell>
                );
              })}
            </TableRow>
          )}
        </TableBody>
      </Table>
      <p className="text-caption-1-medium text-text-tertiary">
        Median held counts the soaks that connected. The best value in each column is marked.
      </p>
    </Card>
  );
}

function FailingCard({ failing, now, className }: { failing: SoakStreamSummary[]; now: number; className?: string }) {
  return (
    <Card title={`Streams that were not clean · ${formatInt(failing.length)}`} className={className}>
      {failing.length === 0 ? (
        <Empty>Every soak in this range was clean.</Empty>
      ) : (
        <Paged items={failing}>
          {(visible) => (
            <RowList label="Streams that were not clean">
              {visible.map((s) => (
                <Row key={s.streamId} roomy className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-body-semibold text-text-primary" title={s.name}>
                      {s.name || `Stream ${s.streamId}`}
                    </span>
                    <ToneChip tone={VERDICT_TONE[s.latest.verdict]}>last: {formatSoak(s.latest).toLowerCase()}</ToneChip>
                  </div>
                  <p className="text-body-2-medium text-text-tertiary">
                    {failingSummary(s)} · {orUnnamed(s.provider)}
                    {s.channelId != null && (
                      <>
                        {" · "}
                        <ChannelLink id={s.channelId} name={s.channelName} />
                      </>
                    )}{" "}
                    · last soaked {formatAgo(s.latest.completedAt, now)}
                  </p>
                </Row>
              ))}
            </RowList>
          )}
        </Paged>
      )}
    </Card>
  );
}

function RecentCard({ recent, total, now }: { recent: SoakRecord[]; total: number; now: number }) {
  const title = recent.length < total ? `Latest soaks · newest ${formatInt(recent.length)} of ${formatInt(total)}` : "Latest soaks";
  return (
    <Card title={title}>
      <Table aria-label="Latest soak results" size="sm">
        <TableHeader>
          <TableColumn isRowHeader>Stream</TableColumn>
          <TableColumn>Provider</TableColumn>
          <TableColumn>Channel</TableColumn>
          <TableColumn>Result</TableColumn>
          <TableColumn className="num whitespace-nowrap">Finished</TableColumn>
        </TableHeader>
        <TableBody items={recent.map((r) => ({ id: `${r.streamId}-${r.completedAt}`, r }))}>
          {({ r }) => (
            <TableRow>
              <TableCell className="max-w-96 truncate">
                <span title={r.name}>{r.name || `Stream ${r.streamId}`}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">{orUnnamed(r.provider)}</TableCell>
              <TableCell className="whitespace-nowrap">
                {r.channelId != null && <ChannelLink id={r.channelId} name={r.channelName} />}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <ToneChip tone={VERDICT_TONE[r.verdict]}>{VERDICT_LABEL[r.verdict]}</ToneChip>
                  {r.verdict !== "unreachable" && (
                    // The chip already says "Clean", so a clean soak shows only how long it held.
                    <span className="text-text-tertiary">{r.verdict === "clean" ? `held ${formatMs(r.heldMs)}` : formatSoak(r)}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="num whitespace-nowrap">{formatAgo(r.completedAt, now)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
