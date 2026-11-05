import type { DatabaseSync } from "node:sqlite";

/**
 * The reads every time-keyed table in the history database shares: rows in a
 * window, the oldest time kept, and pruning. Table and column names are
 * Rostrum's own constants, never user input.
 */
export function timeIndexed(db: DatabaseSync, { table, column, orderBy }: { table: string; column: string; orderBy: string }) {
  const select = db.prepare(`SELECT * FROM ${table} WHERE ${column} BETWEEN ? AND ? ORDER BY ${orderBy}`);
  const oldest = db.prepare(`SELECT MIN(${column}) AS t FROM ${table}`);
  const prune = db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`);
  return {
    between: (from: number, to: number) => select.all(from, to) as unknown[],
    since: (): number | null => {
      const t = (oldest.get() as { t: number | null } | undefined)?.t;
      return typeof t === "number" ? t : null;
    },
    pruneBefore: (t: number) => Number(prune.run(t).changes),
  };
}

/** Runs `work` in one transaction. A failed rollback never hides the error that caused it. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The original error is the one worth reporting.
    }
    throw err;
  }
}
