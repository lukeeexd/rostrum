import type { RunRow } from "@/api/types";

export type RunItem =
  | { kind: "run"; run: RunRow }
  /** Consecutive passes that found nothing due, shown as one row. */
  | { kind: "quiet"; count: number; newest: RunRow; oldest: RunRow };

/** A finished pass that probed, deferred and changed nothing, without error. */
export function isQuiet(run: RunRow): boolean {
  return (
    run.finished_at != null &&
    !run.error &&
    run.probed === 0 &&
    run.dead === 0 &&
    run.reordered === 0 &&
    !run.deferred &&
    !run.assigned &&
    !run.measured &&
    !run.removed
  );
}

/** Collapses runs of quiet passes (Podium sends newest first; order is kept). */
export function collapseRuns(runs: RunRow[]): RunItem[] {
  const items: RunItem[] = [];
  for (const run of runs) {
    const last = items.at(-1);
    if (!isQuiet(run)) items.push({ kind: "run", run });
    else if (last?.kind === "quiet") items[items.length - 1] = { ...last, count: last.count + 1, oldest: run };
    else items.push({ kind: "quiet", count: 1, newest: run, oldest: run });
  }
  return items;
}

export const runDurationMs = (run: RunRow, now: number) => (run.finished_at ?? now) - run.started_at;
