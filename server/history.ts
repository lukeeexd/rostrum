import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CHARTED_PROBLEMS,
  STREAM_STATES,
  type ProblemCounts,
  type HistoryRange,
  type HistoryResponse,
  type ProviderSnapshot,
  type ProvidersResponse,
  type Snapshot,
  type ChannelHistoryResponse,
  type ConnectEvent,
  type ConnectLogResponse,
  type FlakyResponse,
  type SoakRecord,
  type SoaksResponse,
  type StreamState,
} from "../src/api/types";
import type { PodiumStats } from "./podium";
import { summariseSoaks } from "./soak-summary";
import { channelView, openHeadsTable } from "./channel-heads";
import { openConnectTable } from "./connect-log";
import { summariseConnect } from "./connect-summary";
import { openSoakTable } from "./soaks";
import { channelProbes, projectFlaky } from "./flaky";
import type { ProbeBatch } from "./probe-feed";
import { openProbesTable } from "./stream-probes";
import { timeIndexed } from "./sqlite";
import type { StreamIndex } from "./streams-index";

/**
 * Long-term trends. Podium keeps only its last 30 passes, so Rostrum records
 * a compact snapshot of Podium's stats and provider metrics every few
 * minutes in its own SQLite file (node:sqlite, nothing native to build), and
 * serves them back averaged into chart-sized buckets.
 */

export const SAMPLE_EVERY_MS = 5 * 60_000;
export const KEEP_MS = 90 * 24 * 60 * 60_000;
/** Points per chart: enough to read a trend, few enough to stay light. */
const MAX_POINTS = 300;

export const RANGE_MS: Record<HistoryRange, number> = {
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
  "90d": KEEP_MS,
};

/** A finite number or null; counts (where 0 is meaningful) use `count`. */
const orNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: unknown) => orNull(v) ?? 0;
const byState = (value: (s: StreamState) => number) =>
  Object.fromEntries(STREAM_STATES.map((s) => [s, value(s)])) as Record<StreamState, number>;
const sumStates = (states: Record<StreamState, number>) => STREAM_STATES.reduce((sum, s) => sum + states[s], 0);

export const isHistoryRange = (v: string): v is HistoryRange => Object.hasOwn(RANGE_MS, v);

/**
 * One snapshot from Podium's /api/stats, the provider metrics already shown
 * on the Providers page, and (when the walk answered) the Problem channel counts.
 */
export function toSnapshot(t: number, stats: PodiumStats, providers: ProvidersResponse, problems?: ProblemCounts): Snapshot {
  const states = byState((s) => count(stats.streams?.states?.[s]));
  return {
    t,
    streams: { ...states, total: count(stats.streams?.total) || sumStates(states) },
    primary: { total: count(stats.primary?.total), healthy: count(stats.primary?.healthy) },
    freshness: {
      oldestSeconds: orNull(stats.freshness?.oldestProbeAgeSeconds),
      targetSeconds: count(stats.freshness?.targetSeconds),
    },
    providers: providers.providers.map((p) => ({
      name: p.name,
      rank1: p.rank1Channels ?? 0,
      rank1Healthy: p.rank1Healthy ?? 0,
      score: p.score,
      bitrateKbps: p.bitrateKbps.all ?? null,
    })),
    ...(problems ? { problems } : {}),
  };
}

/** Mean of the numbers present; null when there are none. */
function mean(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

/** The bucket average: every number is the mean across the group; providers are matched by name. */
function averageSnapshots(t: number, group: Snapshot[]): Snapshot {
  const avg = (pick: (s: Snapshot) => number | null) => mean(group.map(pick));
  const avg0 = (pick: (s: Snapshot) => number) => avg(pick) ?? 0;
  const names = [...new Set(group.flatMap((s) => s.providers.map((p) => p.name)))];
  const providers = names.map((name): ProviderSnapshot => {
    const rows = group.flatMap((s) => s.providers.filter((p) => p.name === name));
    const pavg = (pick: (p: ProviderSnapshot) => number | null) => mean(rows.map(pick));
    return {
      name,
      rank1: pavg((p) => p.rank1) ?? 0,
      rank1Healthy: pavg((p) => p.rank1Healthy) ?? 0,
      score: pavg((p) => p.score),
      bitrateKbps: pavg((p) => p.bitrateKbps),
    };
  });
  // Averaged over the snapshots that have them; left out when none do.
  const withProblems = group.flatMap((s) => (s.problems ? [s.problems] : []));
  const problems = withProblems.length
    ? (Object.fromEntries(CHARTED_PROBLEMS.map((k) => [k, mean(withProblems.map((p) => p[k])) ?? 0])) as ProblemCounts)
    : undefined;
  return {
    t,
    ...(problems ? { problems } : {}),
    streams: { ...byState((st) => avg0((s) => s.streams[st])), total: avg0((s) => s.streams.total) },
    primary: { total: avg0((s) => s.primary.total), healthy: avg0((s) => s.primary.healthy) },
    freshness: { oldestSeconds: avg((s) => s.freshness.oldestSeconds), targetSeconds: avg0((s) => s.freshness.targetSeconds) },
    providers,
  };
}

/**
 * Averages snapshots into at most `maxPoints` time buckets across [from, to].
 * Empty buckets are left out (gaps where Rostrum or Podium was down), and
 * each point is stamped with its bucket's middle.
 */
export function downsample(snapshots: Snapshot[], from: number, to: number, maxPoints = MAX_POINTS): Snapshot[] {
  const inRange = snapshots.filter((s) => s.t >= from && s.t <= to).sort((a, b) => a.t - b.t);
  if (inRange.length <= maxPoints) return inRange;
  const width = (to - from) / maxPoints;
  const buckets = new Map<number, Snapshot[]>();
  for (const s of inRange) {
    const i = Math.min(maxPoints - 1, Math.floor((s.t - from) / width));
    const bucket = buckets.get(i);
    if (bucket) bucket.push(s);
    else buckets.set(i, [s]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, group]) => averageSnapshots(Math.round(from + (i + 0.5) * width), group));
}

/**
 * The snapshot table (one row per sample, JSON body; `t` is the primary key
 * and the only index needed), and beside it the soak log.
 */
export function openHistoryStore(file: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS snapshots (t INTEGER PRIMARY KEY, data TEXT NOT NULL)");
  const soaks = openSoakTable(db);
  const connect = openConnectTable(db);
  const heads = openHeadsTable(db);
  const probes = openProbesTable(db);
  const insert = db.prepare("INSERT OR REPLACE INTO snapshots (t, data) VALUES (?, ?)");
  const rows = timeIndexed(db, { table: "snapshots", column: "t", orderBy: "t" });
  return {
    add: (s: Snapshot) => void insert.run(s.t, JSON.stringify(s)),
    between: (from: number, to: number): Snapshot[] =>
      rows.between(from, to).map((row) => JSON.parse(String((row as { data: string }).data)) as Snapshot),
    since: rows.since,
    pruneBefore: rows.pruneBefore,
    soaks,
    connect,
    heads,
    probes,
    close: () => db.close(),
  };
}

export type HistoryStore = ReturnType<typeof openHistoryStore>;

/** What every log table in the store can be read with. */
interface LogTable {
  between(from: number, to: number): unknown[];
  since(): number | null;
}

export interface HistoryDeps {
  /** Where to keep the database; undefined turns history off. */
  file: string | undefined;
  stats: () => Promise<PodiumStats>;
  providers: () => Promise<ProvidersResponse>;
  /** Problem channel counts from the preview walk; optional, and a failure only leaves them out of the snapshot. */
  problems?: () => Promise<ProblemCounts>;
  /** Every soak result Podium holds now (server/soaks.ts collectSoaks). */
  soaks: () => Promise<SoakRecord[]>;
  /** Podium's latest Connect deliveries, named (server/connect.ts). */
  connectEvents: () => Promise<ConnectEvent[]>;
  /** The preview walk, for each channel's slot 1; optional, so tests can leave it out. */
  walk?: () => Promise<StreamIndex>;
  /** Probes to log (server/probe-feed.ts), committed once saved; optional, so tests can leave it out. */
  probes?: () => Promise<ProbeBatch>;
  now?: () => number;
  log?: (message: string) => void;
}

/** Logs a failure once until the step succeeds again, so a Podium outage is one line, not one per tick. */
function onceLogger(log: (message: string) => void, what: string) {
  let last = "";
  return async (step: () => Promise<void> | void) => {
    try {
      await step();
      last = "";
    } catch (err) {
      const message = (err as Error).message;
      if (message !== last) log(`rostrum: ${what} skipped: ${message}`);
      last = message;
    }
  };
}

/**
 * Opens the store and, once started, samples every SAMPLE_EVERY_MS: a stats
 * snapshot, new soak results and new Connect events, each independent of the others. A
 * missing or unwritable database disables history with a reason instead of
 * stopping the server; a failed step is logged (once per kind) and skipped.
 */
export function createHistory({ file, stats, providers, problems, soaks, connectEvents, walk, probes, now = Date.now, log = console.warn }: HistoryDeps) {
  let store: HistoryStore | undefined;
  let reason: string | undefined;
  if (!file) {
    reason = "History is off: set HISTORY_DB to a writable file (the container uses /data/rostrum.db on a volume).";
  } else {
    try {
      store = openHistoryStore(file);
    } catch (err) {
      reason = `History is off: cannot open ${path.basename(file)} (${(err as Error).message}).`;
      log(`rostrum: ${reason}`);
    }
  }

  /** The time window a range covers, ending now. */
  const windowOf = (range: HistoryRange): { range: HistoryRange; from: number; to: number } => {
    const to = now();
    return { range, from: to - RANGE_MS[range], to };
  };

  /**
   * One tick step: fetch, then add to a table and prune it to KEEP_MS. The
   * table is looked up after the fetch, since the store may have been closed
   * while it was in flight.
   */
  function logStep<T>(what: string, fetch: () => Promise<T>, table: (s: HistoryStore) => { add(rows: T): unknown; pruneBefore(t: number): number }) {
    const step = onceLogger(log, what);
    return () =>
      step(async () => {
        if (!store) return;
        const rows = await fetch();
        if (!store) return;
        table(store).add(rows);
        table(store).pruneBefore(now() - KEEP_MS);
      });
  }
  const steps = [
    logStep(
      "history sample",
      async () => {
        const [s, p, counts] = await Promise.all([stats(), providers(), problems?.().catch(() => undefined)]);
        return toSnapshot(now(), s, p, counts);
      },
      (s) => s,
    ),
    logStep("soak log update", soaks, (s) => s.soaks),
    logStep("Connect log update", connectEvents, (s) => s.connect),
    ...(walk ? [logStep("channel log update", walk, (s) => s.heads)] : []),
    ...(probes
      ? [
          logStep("probe log update", probes, (s) => ({
            add: (batch: ProbeBatch) => {
              s.probes.add(batch.probes);
              batch.commit();
            },
            pruneBefore: s.probes.pruneBefore,
          })),
        ]
      : []),
  ];
  async function sample(): Promise<void> {
    await Promise.all(steps.map((step) => step()));
  }

  /** A log's summary over a range, from Rostrum's own record (no Podium call); `summarise([])` when there is no store. */
  function readLog<R>(range: HistoryRange, table: (s: HistoryStore) => LogTable, summarise: (rows: never[], w: { from: number; to: number }) => R) {
    const w = windowOf(range);
    if (!store) return { ...w, enabled: false, reason, since: null, ...summarise([], w) };
    const t = table(store);
    return { ...w, enabled: true, since: t.since(), ...summarise(t.between(w.from, w.to) as never[], w) };
  }

  let first: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearTimeout(first);
    clearInterval(timer);
    first = timer = undefined;
  };
  return {
    enabled: Boolean(store),
    sample,
    /** Takes a first sample shortly after start, then one every SAMPLE_EVERY_MS. Timers don't keep the process alive. */
    start() {
      if (!store || timer) return;
      first = setTimeout(() => void sample(), 10_000);
      timer = setInterval(() => void sample(), SAMPLE_EVERY_MS);
      first.unref?.();
      timer.unref?.();
    },
    stop,
    /** Stops sampling and closes the database. */
    close() {
      stop();
      store?.close();
      store = undefined;
    },
    read(range: HistoryRange): HistoryResponse {
      const w = windowOf(range);
      const base = { ...w, intervalMs: SAMPLE_EVERY_MS };
      if (!store) return { ...base, enabled: false, reason, since: null, points: [] };
      return { ...base, enabled: true, since: store.since(), points: downsample(store.between(w.from, w.to), w.from, w.to) };
    },
    /** The soak summary for a range. */
    readSoaks: (range: HistoryRange): SoaksResponse => readLog(range, (s) => s.soaks, summariseSoaks),
    /** The Connect log for a range. */
    readConnect: (range: HistoryRange): ConnectLogResponse => readLog(range, (s) => s.connect, summariseConnect),
    /**
     * One channel over a range: its slot 1, and the soaks and Connect events
     * that concern it. `streamIds` and `name` (from the walk, when it answered)
     * catch soaks logged against another channel carrying the same stream, and
     * events logged before the channel could be linked.
     */
    readChannel(channelId: number, range: HistoryRange, onChannel: { streamIds?: number[]; name?: string | null } = {}): ChannelHistoryResponse {
      const w = windowOf(range);
      if (!store) return { enabled: false, reason, streams: [], ...channelView(channelId, w, { rows: [], since: null, soaks: [], connect: [] }) };
      const log = {
        rows: store.heads.between(channelId, w.from, w.to),
        since: store.heads.since(channelId),
        soaks: store.soaks.between(w.from, w.to),
        connect: store.connect.between(w.from, w.to),
      };
      const streamIds = onChannel.streamIds ?? [];
      const streams = channelProbes(store.probes.between(w.from, w.to, streamIds), streamIds, w.from, w.to);
      return { enabled: true, streams, ...channelView(channelId, w, log, onChannel) };
    },
    /**
     * Streams that flipped between playable and broken over a range, and each
     * provider's share of flaky streams. `index` (when the walk answered)
     * names them and finds their channels; `podiumHistory` says whether
     * Podium's own probe history is feeding the log.
     */
    readFlaky: (range: HistoryRange, index: StreamIndex | null, podiumHistory: boolean): FlakyResponse => ({
      ...readLog(range, (s) => s.probes, (rows, w) => projectFlaky(rows, w.from, w.to, index)),
      podiumHistory,
    }),
  };
}

export type History = ReturnType<typeof createHistory>;
