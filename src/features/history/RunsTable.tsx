import type { RunRow } from "@/api/types";
import { ToneChip } from "@/components/shared/tone";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { formatAgo, formatClock, formatInt, formatMs } from "@/lib/format";
import { describeRunError } from "./lib/errors";
import { collapseRuns, runDurationMs, type RunItem } from "./lib/runs";

export function RunsTable({ runs, now }: { runs: RunRow[]; now: number }) {
  const items = collapseRuns(runs);
  return (
    <Table aria-label="Recent passes" size="sm">
      <TableHeader>
        <TableColumn isRowHeader>When</TableColumn>
        <TableColumn className="num">Took</TableColumn>
        <TableColumn className="num">Probed</TableColumn>
        <TableColumn className="num">From cache</TableColumn>
        <TableColumn className="num">Dead</TableColumn>
        <TableColumn className="num">Reordered</TableColumn>
        <TableColumn className="ps-8!">Outcome</TableColumn>
      </TableHeader>
      <TableBody items={items.map((item) => ({ item, id: key(item) }))}>
        {({ item }) =>
          item.kind === "quiet" ? (
            <TableRow>
              <TableCell>
                <When at={item.newest.started_at} now={now} />
              </TableCell>
              <TableCell colSpan={6}>
                <span className="text-text-tertiary">
                  Nothing was due{item.count > 1 && ` · ${item.count} passes since ${formatClock(item.oldest.started_at)}`}
                </span>
              </TableCell>
            </TableRow>
          ) : (
            <TableRow>
              <TableCell>
                <When at={item.run.started_at} now={now} />
              </TableCell>
              <TableCell className="num">
                {item.run.finished_at == null ? "running" : formatMs(runDurationMs(item.run, now))}
              </TableCell>
              <TableCell className="num">{formatInt(item.run.probed)}</TableCell>
              <TableCell className="num">{formatInt(item.run.cached)}</TableCell>
              <TableCell className="num">{formatInt(item.run.dead)}</TableCell>
              <TableCell className="num">{formatInt(item.run.reordered)}</TableCell>
              <TableCell className="ps-8!">
                {item.run.error ? (
                  <ToneChip tone="bad">{describeRunError(item.run.error)}</ToneChip>
                ) : item.run.finished_at == null ? (
                  <ToneChip tone="accent" dot pulse>
                    Running
                  </ToneChip>
                ) : (
                  <ToneChip tone="good">OK</ToneChip>
                )}
              </TableCell>
            </TableRow>
          )
        }
      </TableBody>
    </Table>
  );
}

const key = (item: RunItem) => (item.kind === "run" ? item.run.run_id : `quiet-${item.newest.run_id}`);

function When({ at, now }: { at: number; now: number }) {
  return (
    <span className="flex flex-col">
      <span className="text-text-primary tabular-nums">{formatClock(at)}</span>
      <span className="text-caption-1-medium text-text-tertiary">{formatAgo(at, now)}</span>
    </span>
  );
}
