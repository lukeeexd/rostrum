import type { DatabaseSync } from "node:sqlite";
import type { StreamStatus } from "../src/lib/streamStatus";
import { transaction } from "./sqlite";

/**
 * Every probe of every stream Rostrum has seen: when Podium probed it and
 * what it found. One row per probe (Podium probes a healthy stream about once
 * a day), keyed by stream and probe time, so the same probe reported twice
 * (by the stream index on each tick, and by Podium's own probe history) is
 * stored once. Read by the Flaky streams page and the channel panel.
 */

export interface LoggedProbe {
  streamId: number;
  probedAt: number;
  status: StreamStatus;
  name: string | null;
  provider: string | null;
}

export interface ProbeRow {
  stream_id: number;
  probed_at: number;
  status: StreamStatus;
  name: string | null;
  provider: string | null;
}

export function openProbesTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS stream_probes (
    stream_id INTEGER NOT NULL,
    probed_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    name TEXT,
    provider TEXT,
    PRIMARY KEY (stream_id, probed_at)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS stream_probes_time ON stream_probes (probed_at)`);
  const insert = db.prepare("INSERT OR IGNORE INTO stream_probes (stream_id, probed_at, status, name, provider) VALUES (?, ?, ?, ?, ?)");
  // Everything older than the cutoff, except each stream's last probe before it: that one says what state the window opens in.
  const prune = db.prepare(
    `DELETE FROM stream_probes WHERE probed_at < ?1 AND (stream_id, probed_at) NOT IN
       (SELECT stream_id, MAX(probed_at) FROM stream_probes WHERE probed_at < ?1 GROUP BY stream_id)`,
  );
  // A stream not probed since the cutoff (no longer managed) goes entirely.
  const pruneGone = db.prepare(
    "DELETE FROM stream_probes WHERE stream_id IN (SELECT stream_id FROM stream_probes GROUP BY stream_id HAVING MAX(probed_at) < ?)",
  );
  // For each stream: the probe in force when the window opens, and every probe after it. The
  // opening probes are found in one grouped pass over the key, not one lookup per row.
  const window = (only: string) => `
    WITH opening AS (SELECT stream_id, MAX(probed_at) AS t FROM stream_probes WHERE probed_at <= ?1 ${only} GROUP BY stream_id)
    SELECT p.* FROM stream_probes p LEFT JOIN opening o ON o.stream_id = p.stream_id
    WHERE p.probed_at <= ?2 AND p.probed_at >= COALESCE(o.t, ?1) ${only.replaceAll("stream_id", "p.stream_id")}
    ORDER BY p.stream_id, p.probed_at`;
  const all = db.prepare(window(""));
  const some = db.prepare(window("AND stream_id IN (SELECT value FROM json_each(?3))"));
  const first = db.prepare("SELECT MIN(probed_at) AS t FROM stream_probes");

  return {
    /** Logs probes not already logged; returns how many were new. */
    add(probes: LoggedProbe[]): number {
      return transaction(db, () =>
        probes.reduce((n, p) => n + Number(insert.run(p.streamId, p.probedAt, p.status, p.name, p.provider).changes), 0),
      );
    },
    pruneBefore: (t: number) => Number(pruneGone.run(t).changes) + Number(prune.run(t).changes),
    /** Probes covering [from, to] (of `streamIds` only, when given), by stream and then time. */
    between: (from: number, to: number, streamIds?: number[]) =>
      (streamIds ? some.all(from, to, JSON.stringify(streamIds)) : all.all(from, to)) as unknown as ProbeRow[],
    since: (): number | null => {
      const t = (first.get() as { t: number | null } | undefined)?.t;
      return typeof t === "number" ? t : null;
    },
  };
}

export type ProbesTable = ReturnType<typeof openProbesTable>;
