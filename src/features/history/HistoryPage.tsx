import { RiFlashlightLine, RiPulseLine, RiShuffleLine, RiSkullLine } from "@remixicon/react";
import { useProgress } from "@/api/queries";
import type { ProgressResponse } from "@/api/types";
import { Card, Empty, Fact } from "@/components/shared/Card";
import { Notice } from "@/components/shared/Notice";
import { QueryState } from "@/components/shared/QueryState";
import { StatGrid, StatTile } from "@/components/shared/StatTile";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt, formatMs } from "@/lib/format";
import { ConnectLogCard } from "@/features/connect/ConnectLogCard";
import { ActivityChart } from "./ActivityChart";
import { CacheAgeBar } from "./CacheAgeBar";
import { RunsTable } from "./RunsTable";

/** Everything here comes from /api/progress, already polled for the shell. */
export function HistoryPage() {
  const progress = useProgress();
  return <QueryState query={progress}>{(data) => <HistoryBody data={data} />}</QueryState>;
}

function HistoryBody({ data }: { data: ProgressResponse }) {
  const now = useNow(15_000);
  const { day, cache, activity, maxAgeMs } = data.stats;
  const oldestAgeMs = cache.oldestProbedAt == null ? null : now - cache.oldestProbedAt;

  return (
    <>
      <StatGrid>
        <StatTile icon={RiFlashlightLine} label="Passes" value={formatInt(day.passes)} caption={`${formatInt(day.working)} did work`} />
        <StatTile icon={RiPulseLine} label="Streams probed" value={formatInt(day.probed)} caption="last 24 hours" />
        <StatTile icon={RiSkullLine} label="Dead found" value={formatInt(day.dead)} tone={day.dead ? "bad" : undefined} caption="last 24 hours" />
        <StatTile icon={RiShuffleLine} label="Reorders" value={formatInt(day.reordered)} caption="channels re-ranked" />
      </StatGrid>
      {day.failed > 0 && <Notice tone="bad">{formatInt(day.failed)} passes failed in the last 24 hours.</Notice>}

      {/* Wide screens: chart, library and Connect events stacked on the left,
          recent passes beside them, so the table never stretches to the full page width. */}
      <div className="grid items-start gap-4 2xl:grid-cols-2">
        <div className="grid gap-4 xl:grid-cols-5 2xl:grid-cols-1">
          <Card title="Activity" className="xl:col-span-3 2xl:col-span-1">
            <ActivityChart activity={activity} />
          </Card>

          <Card title="Library" className="xl:col-span-2 2xl:col-span-1">
            <dl className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
              <Fact label="Live" value={formatInt(cache.alive)} />
              <Fact label="Dead" value={formatInt(cache.dead)} />
              <Fact label="Waiting" value={formatInt(cache.due)} />
              <Fact
                label="Oldest check"
                value={formatMs(oldestAgeMs)}
                sub={`target ${formatMs(maxAgeMs)}`}
                tone={oldestAgeMs != null && oldestAgeMs > maxAgeMs ? "warn" : undefined}
              />
            </dl>
            <CacheAgeBar ages={cache.ages} />
            <p className="text-caption-1-medium text-text-tertiary">Newest check {formatAgo(cache.newestProbedAt, now)}.</p>
          </Card>

          <div className="xl:col-span-5 2xl:col-span-1">
            <ConnectLogCard />
          </div>
        </div>

        <Card title="Recent passes">
          {data.runs.length === 0 ? <Empty>No passes recorded yet.</Empty> : <RunsTable runs={data.runs} now={now} />}
        </Card>
      </div>
    </>
  );
}
