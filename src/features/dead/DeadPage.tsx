import { RiCloseCircleLine, RiGhostLine, RiRefreshLine, RiStarLine, RiTimerLine, RiTvLine } from "@remixicon/react";
import { useDead } from "@/api/queries";
import type { DeadResponse } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { Notice } from "@/components/shared/Notice";
import { QueryState } from "@/components/shared/QueryState";
import { StatGrid, StatTile } from "@/components/shared/StatTile";
import { Button } from "@/components/ui/buttons/button";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt } from "@/lib/format";
import { streakTone } from "./lib/dead";
import { StreamsCard } from "./StreamsCard";

/** /api/dead walks Dispatcharr, so it is polled slowly and refreshed by hand. */
export function DeadPage() {
  const dead = useDead();
  return (
    <QueryState query={dead}>
      {(data) => <DeadBody data={data} refreshing={dead.isFetching} onRefresh={() => void dead.refetch()} />}
    </QueryState>
  );
}

function DeadBody({ data, refreshing, onRefresh }: { data: DeadResponse; refreshing: boolean; onRefresh: () => void }) {
  const now = useNow(15_000);
  const { totals } = data;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="px-1 text-body-2-medium text-text-tertiary">Channel data as of {formatAgo(data.fetchedAt, now)}</p>
        <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {data.cacheUnavailable && (
        <Notice tone="warn">Podium could not read its verdict cache, so this list may be incomplete.</Notice>
      )}

      <StatGrid className="md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile icon={RiCloseCircleLine} label="Dead" value={formatInt(totals.dead)} tone={totals.dead ? "bad" : undefined} />
        <StatTile icon={RiTvLine} label="Black screen" value={formatInt(totals.black)} tone={totals.black ? "bad" : undefined} />
        <StatTile
          icon={RiStarLine}
          label="Served first"
          value={formatInt(totals.channelsServedFirst)}
          tone={totals.channelsServedFirst ? "bad" : "good"}
          caption={`of ${formatInt(totals.channelsAffected)} affected channels`}
        />
        <StatTile icon={RiGhostLine} label="Orphaned verdicts" value={formatInt(totals.orphans)} caption="streams gone from the catalogue" />
        <StatTile
          icon={RiTimerLine}
          label="Worst streak"
          value={`${formatInt(totals.worstStreak)} checks`}
          tone={streakTone(totals.worstStreak)}
          caption={totals.oldestProbedAt ? `oldest verdict ${formatAgo(totals.oldestProbedAt, now)}` : undefined}
        />
      </StatGrid>

      {/* Wide screens: the small provider table sits beside the stream list
          instead of stretching four columns across the whole page. */}
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ProvidersCard providers={data.providers} />
        <StreamsCard data={data} now={now} />
      </div>
    </>
  );
}

function ProvidersCard({ providers }: { providers: DeadResponse["providers"] }) {
  return (
    <Card title="By provider">
      <Table aria-label="Dead and black streams by provider" size="sm">
        <TableHeader>
          <TableColumn isRowHeader>Provider</TableColumn>
          <TableColumn className="num">Dead</TableColumn>
          <TableColumn className="num">Black</TableColumn>
          <TableColumn className="num">Streams</TableColumn>
        </TableHeader>
        <TableBody items={providers} renderEmptyState={() => <Empty>No providers.</Empty>}>
          {(p) => (
            <TableRow>
              <TableCell>{p.name}</TableCell>
              <TableCell className="num">{formatInt(p.dead)}</TableCell>
              <TableCell className="num">{formatInt(p.black)}</TableCell>
              <TableCell className="num">{formatInt(p.streams)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
