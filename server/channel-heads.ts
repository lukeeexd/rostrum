import type { DatabaseSync } from "node:sqlite";
import type { ChannelHistoryResponse, ConnectEvent, HeadChange, HeadSegment, HeadStatus, HeadStream, SoakRecord } from "../src/api/types";
import { transaction } from "./sqlite";
import type { StreamIndex } from "./streams-index";

/**
 * Each channel's slot 1 over time, from the preview walk on the history tick.
 * Only changes are written (a different stream first, or the same one
 * changing state), so a channel costs a few rows a day; the latest row of
 * each channel is stamped `last_seen` on every tick, so a stretch Rostrum was
 * not running shows as a gap rather than as more of the same.
 */

/** How long after its last sighting a state is assumed to have lasted: one tick. */
export const SEEN_FOR_MS = 5 * 60_000;
/** Most changes, soaks and Connect events returned for a channel and range. */
const CHANGES_LIMIT = 100;
const LIST_LIMIT = 50;

export interface HeadRow {
  channel_id: number;
  since: number;
  last_seen: number;
  stream_id: number | null;
  name: string | null;
  provider: string | null;
  status: HeadStatus;
}

/** What a channel serves first, from the walk. */
function headOf(index: StreamIndex, channel: StreamIndex["channels"][number]): HeadStream {
  const first = channel.streams[0];
  if (!first) return { streamId: null, name: null, provider: null, status: "empty" };
  const known = index.streams.get(first.streamId);
  return { streamId: first.streamId, name: known?.name ?? null, provider: known?.provider ?? null, status: first.status };
}

const sameHead = (row: HeadRow, head: HeadStream) => row.stream_id === head.streamId && row.status === head.status;
const toStream = (r: HeadRow): HeadStream => ({ streamId: r.stream_id, name: r.name, provider: r.provider, status: r.status });

export function openHeadsTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS channel_heads (
    channel_id INTEGER NOT NULL,
    since INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    stream_id INTEGER,
    name TEXT,
    provider TEXT,
    status TEXT NOT NULL,
    PRIMARY KEY (channel_id, since)
  )`);
  const latest = db.prepare(
    `SELECT h.* FROM channel_heads h
     JOIN (SELECT channel_id, MAX(since) AS since FROM channel_heads GROUP BY channel_id) m
       ON h.channel_id = m.channel_id AND h.since = m.since`,
  );
  const insert = db.prepare(
    "INSERT OR REPLACE INTO channel_heads (channel_id, since, last_seen, stream_id, name, provider, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const seen = db.prepare("UPDATE channel_heads SET last_seen = ?, name = COALESCE(name, ?), provider = COALESCE(provider, ?) WHERE channel_id = ? AND since = ?");
  // Everything older than the cutoff, except each channel's last row before it: that row says what slot 1 held when the window opens.
  const prune = db.prepare(
    `DELETE FROM channel_heads WHERE since < ?1 AND (channel_id, since) NOT IN
       (SELECT channel_id, MAX(since) FROM channel_heads WHERE since < ?1 GROUP BY channel_id)`,
  );
  // A channel not seen since the cutoff (deleted in Dispatcharr) goes entirely.
  const pruneGone = db.prepare(
    "DELETE FROM channel_heads WHERE channel_id IN (SELECT channel_id FROM channel_heads GROUP BY channel_id HAVING MAX(last_seen) < ?)",
  );
  // The row in force when the window opens, and every row after it.
  const forChannel = db.prepare(
    `SELECT * FROM channel_heads WHERE channel_id = ?1 AND since <= ?3 AND since >= COALESCE(
       (SELECT MAX(since) FROM channel_heads WHERE channel_id = ?1 AND since <= ?2), ?2)
     ORDER BY since`,
  );
  const first = db.prepare("SELECT MIN(since) AS t FROM channel_heads WHERE channel_id = ?");

  return {
    /** Records each channel's slot 1 from a walk, as of when the walk ran: a new row when it changed, otherwise "still seen". */
    add(index: StreamIndex): number {
      const at = index.walkedAt;
      const last = new Map((latest.all() as unknown as HeadRow[]).map((r) => [r.channel_id, r]));
      return transaction(db, () => {
        let changed = 0;
        for (const channel of index.channels) {
          const head = headOf(index, channel);
          const prev = last.get(channel.id);
          if (prev && sameHead(prev, head)) {
            seen.run(at, head.name, head.provider, channel.id, prev.since);
          } else {
            insert.run(channel.id, at, at, head.streamId, head.name, head.provider, head.status);
            changed++;
          }
        }
        return changed;
      });
    },
    pruneBefore: (t: number) => Number(pruneGone.run(t).changes) + Number(prune.run(t).changes),
    /** A channel's rows covering [from, to], oldest first. */
    between: (channelId: number, from: number, to: number) => forChannel.all(channelId, from, to) as unknown as HeadRow[],
    since: (channelId: number): number | null => {
      const t = (first.get(channelId) as { t: number | null } | undefined)?.t;
      return typeof t === "number" ? t : null;
    },
  };
}

export type HeadsTable = ReturnType<typeof openHeadsTable>;

const playable = (s: HeadStatus) => s === "alive" || s === "low_bitrate";

/**
 * Segments, the playable share and the changes for [from, to], from a
 * channel's rows (oldest first). Each row lasts until the next one, or until
 * a tick after it was last seen, whichever is sooner.
 */
export function summariseHeads(rows: HeadRow[], from: number, to: number): { segments: HeadSegment[]; playableShare: number | null; changes: HeadChange[] } {
  const segments: HeadSegment[] = [];
  const changes: HeadChange[] = [];
  rows.forEach((r, i) => {
    const next = rows[i + 1];
    const start = Math.max(r.since, from);
    const end = Math.min(next ? next.since : Infinity, r.last_seen + SEEN_FOR_MS, to);
    if (end > start) segments.push({ ...toStream(r), from: start, to: end });
    if (i > 0 && r.since >= from) changes.push({ at: r.since, from: toStream(rows[i - 1]), to: toStream(r) });
  });
  const total = segments.reduce((n, s) => n + (s.to - s.from), 0);
  const good = segments.reduce((n, s) => n + (playable(s.status) ? s.to - s.from : 0), 0);
  return { segments, playableShare: total > 0 ? good / total : null, changes: changes.reverse().slice(0, CHANGES_LIMIT) };
}

/**
 * One channel's history over a window: its slot 1 from `rows`, and the soaks
 * and Connect events that concern it. A soak counts if it was logged against
 * the channel or is of a stream the channel carries now (`streamIds`); an
 * event if it was linked to the channel, or unlinked but under its `name`.
 */
export function channelView(
  channelId: number,
  window: Pick<ChannelHistoryResponse, "range" | "from" | "to">,
  log: { rows: HeadRow[]; since: number | null; soaks: SoakRecord[]; connect: ConnectEvent[] },
  { streamIds = [], name = null }: { streamIds?: number[]; name?: string | null } = {},
): Omit<ChannelHistoryResponse, "enabled" | "reason"> {
  const onChannel = new Set(streamIds);
  return {
    ...window,
    since: log.since,
    ...summariseHeads(log.rows, window.from, window.to),
    soaks: log.soaks.filter((r) => r.channelId === channelId || onChannel.has(r.streamId)).slice(0, LIST_LIMIT),
    connect: log.connect
      .filter((e) => e.channelId === channelId || (name != null && e.channelId == null && e.channelName === name))
      .slice(0, LIST_LIMIT),
  };
}
