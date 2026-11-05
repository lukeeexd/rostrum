import type { DatabaseSync } from "node:sqlite";
import type { ConnectEvent } from "../src/api/types";
import { timeIndexed, transaction } from "./sqlite";

/**
 * Dispatcharr Connect events, kept. Podium holds only its last 25 deliveries
 * from 14 days, so on the history tick Rostrum logs each new one (keyed by
 * Podium's delivery id and arrival time) with the stream names as they were.
 * connect-summary.ts adds the log up.
 */

export function openConnectTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS connect_events (
    id INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    event TEXT NOT NULL,
    reason TEXT NOT NULL,
    accepted INTEGER NOT NULL,
    error TEXT,
    channel_name TEXT,
    channel_id INTEGER,
    from_id INTEGER,
    from_name TEXT,
    from_provider TEXT,
    to_id INTEGER,
    to_name TEXT,
    to_provider TEXT,
    PRIMARY KEY (id, received_at)
  );
  CREATE INDEX IF NOT EXISTS connect_events_received_at ON connect_events (received_at)`);
  // A repeat delivery changes nothing, except to fill in names (or a channel) that were unknown when it was first logged.
  const upsert = db.prepare(
    `INSERT INTO connect_events (id, received_at, event, reason, accepted, error, channel_name, channel_id,
       from_id, from_name, from_provider, to_id, to_name, to_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id, received_at) DO UPDATE SET
       channel_id = COALESCE(channel_id, excluded.channel_id),
       from_name = COALESCE(from_name, excluded.from_name),
       from_provider = COALESCE(from_provider, excluded.from_provider),
       to_name = COALESCE(to_name, excluded.to_name),
       to_provider = COALESCE(to_provider, excluded.to_provider)`,
  );
  const rows = timeIndexed(db, { table: "connect_events", column: "received_at", orderBy: "received_at DESC, id DESC" });

  return {
    add: (events: ConnectEvent[]) =>
      transaction(db, () => {
        for (const e of events) {
          upsert.run(
            e.id,
            e.receivedAt,
            e.event,
            e.reason,
            e.accepted ? 1 : 0,
            e.error,
            e.channelName,
            e.channelId,
            e.from?.id ?? null,
            e.from?.name ?? null,
            e.from?.provider ?? null,
            e.to?.id ?? null,
            e.to?.name ?? null,
            e.to?.provider ?? null,
          );
        }
      }),
    /** Newest first. */
    between: (from: number, to: number): ConnectEvent[] => rows.between(from, to).map((r) => fromRow(r as ConnectRow)),
    since: rows.since,
    pruneBefore: rows.pruneBefore,
  };
}

export type ConnectTable = ReturnType<typeof openConnectTable>;

interface ConnectRow {
  id: number;
  received_at: number;
  event: string;
  reason: string;
  accepted: number;
  error: string | null;
  channel_name: string | null;
  channel_id: number | null;
  from_id: number | null;
  from_name: string | null;
  from_provider: string | null;
  to_id: number | null;
  to_name: string | null;
  to_provider: string | null;
}

const ref = (id: number | null, name: string | null, provider: string | null) => (id == null ? null : { id, name, provider });

function fromRow(r: ConnectRow): ConnectEvent {
  return {
    id: r.id,
    event: r.event,
    reason: r.reason,
    receivedAt: r.received_at,
    accepted: r.accepted === 1,
    error: r.error,
    channelName: r.channel_name,
    channelId: r.channel_id,
    from: ref(r.from_id, r.from_name, r.from_provider),
    to: ref(r.to_id, r.to_name, r.to_provider),
  };
}
