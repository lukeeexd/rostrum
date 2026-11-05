import { useState } from "react";
import { useHistory } from "@/api/queries";
import type { HistoryRange, HistoryResponse, Snapshot } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { CHART_PRIMARY } from "@/components/shared/chart";
import { Notice } from "@/components/shared/Notice";
import { QueryState } from "@/components/shared/QueryState";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt, formatMs, formatPercent } from "@/lib/format";
import { HISTORY_RANGES } from "@/lib/ranges";
import {
  formatHours,
  formatPct,
  freshnessRows,
  pointLabel,
  primaryRows,
  problemChannelRows,
  problemRows,
  providerRows,
  tickFormatter,
  type ProviderMetric,
} from "./lib/series";
import { TrendChart, type Series } from "./TrendChart";

/** Provider lines take the chart palette in turn. */
const PROVIDER_COLORS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `var(--color-chart-${n}-active)`);

/** Same order and wording as the Problem channels page. */
const PROBLEM_CHANNEL_SERIES: Series[] = [
  { key: "noHealthy", name: "No playable stream", color: "var(--color-rose-500)" },
  { key: "badFirst", name: "Dead or black first", color: "var(--color-yellow-500)" },
  { key: "oneProvider", name: "One provider only", color: "var(--color-chart-3-active)" },
  { key: "empty", name: "No streams", color: "var(--color-text-secondary)" },
];

const PROBLEM_SERIES: Series[] = [
  { key: "low_bitrate", name: "Low bitrate", color: "var(--color-yellow-500)" },
  { key: "black", name: "Black screen", color: "var(--color-text-secondary)" },
  { key: "dead", name: "Dead", color: "var(--color-rose-500)" },
];

/**
 * How things have moved over days and weeks, from the snapshots Rostrum
 * records every 5 minutes (Podium itself keeps only its last 30 passes).
 */
export function TrendsPage() {
  const [range, setRange] = useState<HistoryRange>("7d");
  const history = useHistory(range);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<HistoryRange> label="Range" value={range} onChange={setRange} options={HISTORY_RANGES} />
        {history.data?.enabled && <Recording data={history.data} />}
      </div>
      <QueryState query={history}>{(data) => <TrendsBody data={data} />}</QueryState>
    </>
  );
}

function Recording({ data }: { data: HistoryResponse }) {
  const now = useNow(60_000);
  return (
    <p className="px-1 text-body-2-medium text-text-tertiary">
      A snapshot every {formatMs(data.intervalMs)}
      {data.since != null && `, kept since ${formatAgo(data.since, now)}`}, for up to 90 days
    </p>
  );
}

function TrendsBody({ data }: { data: HistoryResponse }) {
  if (!data.enabled) {
    return (
      <Notice tone="info">
        {data.reason} With Docker, the compose file in this repo mounts a <code>rostrum-data</code> volume and sets{" "}
        <code>HISTORY_DB=/data/rostrum.db</code> for you.
      </Notice>
    );
  }
  if (data.points.length < 2) {
    return (
      <Card>
        <Empty>
          Recording has started. Trends appear once there are a couple of snapshots
          {data.points.length === 0 ? ", the first in about ten seconds" : ", the next within five minutes"}.
        </Empty>
      </Card>
    );
  }

  const common = { tick: tickFormatter(data.range), label: pointLabel };
  const latest = data.points.at(-1)!;
  const provider = { points: data.points, range: data.range };

  return (
    <div className="grid items-start gap-4 2xl:grid-cols-2">
      <Card
        title={`Problem streams · ${formatPercent(latest.streams.alive, latest.streams.total)} of ${formatInt(Math.round(latest.streams.total))} alive now`}
      >
        <TrendChart
          {...common}
          kind="stacked"
          rows={problemRows(data.points)}
          series={PROBLEM_SERIES}
          format={(v) => formatInt(Math.round(v))}
          domain={[0, "auto"]}
          description={`Low-bitrate, black-screen and dead streams over the last ${data.range}`}
        />
      </Card>
      <Card title="Problem channels">
        {data.points.filter((p) => p.problems).length >= 2 ? (
          <TrendChart
            {...common}
            rows={problemChannelRows(data.points)}
            series={PROBLEM_CHANNEL_SERIES}
            format={(v) => formatInt(Math.round(v))}
            domain={[0, "auto"]}
            description={`Channels with no playable stream, a dead or black stream first, one provider only, or no streams, over the last ${data.range}`}
          />
        ) : (
          <Empty>Recorded from this version on; the lines appear once there are two snapshots with the counts, within ten minutes.</Empty>
        )}
      </Card>
      <Card title="Channels served first by a healthy stream">
        <TrendChart
          {...common}
          rows={primaryRows(data.points)}
          series={[{ key: "healthy", name: "Healthy first stream", color: CHART_PRIMARY }]}
          format={formatPct}
          domain={[0, 100]}
          description={`Share of channels whose first stream is healthy over the last ${data.range}`}
        />
      </Card>
      <Card title="Freshness">
        <TrendChart
          {...common}
          rows={freshnessRows(data.points)}
          series={[
            { key: "oldest", name: "Oldest verdict in service", color: CHART_PRIMARY },
            { key: "target", name: "Target", color: "var(--color-neutral-400)" },
          ]}
          format={formatHours}
          domain={[0, "auto"]}
          description={`Age of the oldest verdict against the target over the last ${data.range}`}
        />
      </Card>
      <ProviderChart {...provider} metric="healthyFirst" title="Healthy when served first, by provider" format={formatPct} />
      <ProviderChart {...provider} metric="score" title="Median score, by provider" format={(v) => v.toFixed(2)} />
      <ProviderChart
        {...provider}
        metric="bitrate"
        title="Median bitrate (Mbps), by provider"
        format={(v) => `${Math.round(v * 10) / 10} Mbps`}
        axisFormat={(v) => String(Math.round(v))}
      />
    </div>
  );
}

/** One line per provider for one metric. */
function ProviderChart({
  points,
  range,
  metric,
  title,
  format,
  axisFormat,
}: {
  points: Snapshot[];
  range: HistoryRange;
  metric: ProviderMetric;
  title: string;
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
}) {
  const { rows, series } = providerRows(points, metric);
  return (
    <Card title={title}>
      <TrendChart
        tick={tickFormatter(range)}
        label={pointLabel}
        rows={rows}
        series={series.map((s, i) => ({ ...s, color: PROVIDER_COLORS[i % PROVIDER_COLORS.length] }))}
        format={format}
        axisFormat={axisFormat}
        description={`${title} for ${series.map((s) => s.name).join(", ")} over the last ${range}`}
      />
    </Card>
  );
}
