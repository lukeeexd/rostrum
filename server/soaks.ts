import type { DatabaseSync } from "node:sqlite";
import type { SoakRecord } from "../src/api/types";
import { soakVerdict } from "../src/lib/soak";
import { timeIndexed, transaction } from "./sqlite";
import type { StreamIndex } from "./streams-index";

/**
 * Soak results over time. Podium keeps only each stream's latest soak and
 * shows it only in a channel's preview, so on the history tick Rostrum takes
 * them from a walk of every preview (streams-index.ts) and logs each result
 * it has not seen, keyed by stream and completion time. The verdicts and the
 * page's numbers are in soak-summary.ts.
 */

/** Every soak result Podium holds, one per stream, from a preview walk. */
export function collectSoaks(index: StreamIndex): SoakRecord[] {
  return [...index.streams.values()].flatMap(({ lastSoak, name, provider, ...stream }) =>
    lastSoak ? [{ ...stream, name: name ?? "", provider: provider ?? "", ...lastSoak, verdict: soakVerdict(lastSoak) }] : [],
  );
}

/** The soak log, in the history database. One row per (stream, completion time). */
export function openSoakTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS soaks (
    stream_id INTEGER NOT NULL,
    completed_at INTEGER NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    channel_id INTEGER,
    channel_name TEXT,
    held_ms INTEGER NOT NULL,
    drops INTEGER NOT NULL,
    failed_dials INTEGER NOT NULL,
    unreachable INTEGER NOT NULL,
    PRIMARY KEY (stream_id, completed_at)
  );
  CREATE INDEX IF NOT EXISTS soaks_completed_at ON soaks (completed_at)`);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO soaks (stream_id, completed_at, name, provider, channel_id, channel_name, held_ms, drops, failed_dials, unreachable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const rows = timeIndexed(db, { table: "soaks", column: "completed_at", orderBy: "completed_at DESC, stream_id" });

  return {
    /** Logs the results not seen before; returns how many were new. */
    add: (records: SoakRecord[]): number =>
      transaction(db, () => {
        let added = 0;
        for (const r of records) {
          added += Number(
            insert.run(r.streamId, r.completedAt, r.name, r.provider, r.channelId, r.channelName, r.heldMs, r.drops, r.failedDials, r.unreachable ? 1 : 0)
              .changes,
          );
        }
        return added;
      }),
    /** Newest first. */
    between: (from: number, to: number): SoakRecord[] => rows.between(from, to).map((row) => fromRow(row as SoakRow)),
    since: rows.since,
    pruneBefore: rows.pruneBefore,
  };
}

export type SoakTable = ReturnType<typeof openSoakTable>;

interface SoakRow {
  stream_id: number;
  completed_at: number;
  name: string;
  provider: string;
  channel_id: number | null;
  channel_name: string | null;
  held_ms: number;
  drops: number;
  failed_dials: number;
  unreachable: number;
}

function fromRow(r: SoakRow): SoakRecord {
  const result = { drops: r.drops, failedDials: r.failed_dials, unreachable: r.unreachable === 1 };
  return {
    streamId: r.stream_id,
    completedAt: r.completed_at,
    name: r.name,
    provider: r.provider,
    channelId: r.channel_id,
    channelName: r.channel_name,
    heldMs: r.held_ms,
    ...result,
    verdict: soakVerdict(result),
  };
}
