/**
 * Podium 1.17 response shapes for the endpoints Rostrum reads. Checked
 * against a live instance (see src/test/fixtures). Every epoch value is in
 * milliseconds; fields named `…Seconds` are seconds. Fields Podium adds in
 * some versions or phases are optional.
 */

import type { StreamStatus } from "../lib/streamStatus";

export type WorkerState = "disabled" | "active" | "stale" | "absent" | "unknown";

export type Phase =
  | "idle"
  | "fetching"
  | "planning"
  | "probing"
  | "soaking"
  | "paused"
  | "done"
  | "failed";

export interface Health {
  status: string;
  version?: string;
  worker: WorkerState;
  heartbeatAgeSeconds: number | null;
}

export interface RunRow {
  run_id: string;
  started_at: number;
  finished_at: number | null;
  channels: number;
  probed: number;
  cached: number;
  dead: number;
  reordered: number;
  unchanged?: number;
  assigned?: number;
  measured?: number;
  removed?: number;
  skipped: number;
  deferred?: number;
  backlog?: number;
  next_due_at?: number | null;
  oldest_probed_at?: number | null;
  error: string | null;
}

export interface Stats {
  worker: WorkerState;
  heartbeatAgeSeconds: number | null;
  catalogueWrittenAt: number | null;
  streams: {
    total: number;
    measured: number;
    healthy: number;
    states: { alive: number; dead: number; black: number; low_bitrate: number; unmeasured: number };
  };
  primary: { total: number; healthy: number };
  providers: { name: string; primary: number; healthy: number }[];
  freshness: { oldestProbeAgeSeconds: number | null; targetSeconds: number; breaching: boolean };
  lastRun: RunRow | null;
}

export interface Lane {
  id: number;
  name: string;
  limit: number;
  /** Streams finished successfully (includes `dead`). */
  done: number;
  /** Subset of `done` found dead. */
  dead?: number;
  /** Probes that errored; disjoint from `done`. */
  failed: number;
  /** Still waiting in this lane. */
  queued: number;
  /** Names of streams being probed right now. */
  current: string[];
}

export interface Progress {
  runId: string | null;
  phase: Phase;
  startedAt: number | null;
  probed: number;
  total: number;
  dead: number;
  reordered: number;
  unchanged?: number;
  cached: number;
  deferred: number;
  backlog: number;
  measured?: number;
  retired?: number;
  soaked?: number;
  soakTotal?: number;
  soakDrops?: number;
  dueAt: number | null;
  heldBack: Record<string, number>;
  lanes: Lane[];
  message: string;
  nextRunAt: number | null;
  tickMs: number;
  maxAgeMs: number;
  oldestManagedProbedAt?: number | null;
  updatedAt: number;
}

export interface CacheHealth {
  total: number;
  alive: number;
  dead: number;
  oldestProbedAt: number | null;
  newestProbedAt: number | null;
  due: number;
  nextDueAt: number | null;
  ages: { hour: number; sixHours: number; day: number; older: number };
}

export interface DayStats {
  passes: number;
  /** Passes that did any work. */
  working: number;
  probed: number;
  dead: number;
  reordered: number;
  failed: number;
}

export interface ActivityBucket {
  /** Start of the hour, epoch ms. */
  from: number;
  probed: number;
  dead: number;
}

export interface ProgressResponse {
  progress: Progress;
  /** True when the worker is absent or stale: `progress` is then an idle placeholder. */
  stale: boolean;
  worker: WorkerState;
  heartbeatAgeSeconds: number | null;
  /** Re-check marks: `all` is when a whole-catalogue re-check was queued. */
  refresh: { all: number | null; groups: number };
  runs: RunRow[];
  stats: {
    cache: CacheHealth;
    day: DayStats;
    activity: ActivityBucket[];
    liveTtlMs: number;
    deadTtlMs: number;
    deadTtlMaxMs: number;
    maxAgeMs: number;
  };
}

export interface DeadEntry {
  streamId: number;
  name: string;
  providerId: number;
  provider: string;
  status: "dead" | "black";
  probedAt: number;
  deadStreak: number;
  error: string;
  bitrateKbps: number;
  height: number;
  channels: { id: number; name: string; groupId: number | null; rank: number }[];
}

export interface DeadResponse {
  fetchedAt: number;
  cacheUnavailable?: boolean;
  totals: {
    dead: number;
    black: number;
    orphans: number;
    channelsServedFirst: number;
    channelsAffected: number;
    worstStreak: number;
    oldestProbedAt: number | null;
  };
  providers: { id: number; name: string; dead: number; black: number; streams: number }[];
  channels: {
    id: number;
    name: string;
    groupId: number | null;
    deadCount: number;
    assigned: number;
    servedFirstDead: boolean;
  }[];
  entries: DeadEntry[];
  entryTotal: number;
  truncated: boolean;
}

export type ConnectState = "disabled" | "blocked" | "pending" | "error" | "listening";

export interface ConnectStatus {
  state: ConnectState;
  enabled: boolean;
  stabilityEnabled?: boolean;
  callbackUrl?: string;
  summary: {
    trackingSince?: number | null;
    accepted: number;
    rejected: number;
    lastReceivedAt: number | null;
    lastRejectedAt?: number | null;
    lastRejection?: string | null;
    syncErrors?: number;
    lastSyncAt: number | null;
    lastSyncSuccessAt?: number | null;
    syncError: string | null;
  };
  pending: number;
  recent: unknown[];
}

/* ------------------------------------------------------------------------
 * Problem channels: sorted from Rostrum's walk of every channel preview.
 * --------------------------------------------------------------------- */

/** One section per channel, checked in this order: a channel lands in the first that fits. */
export const PROBLEM_KINDS = ["noHealthy", "badFirst", "oneProvider", "empty", "unmeasured"] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export interface ProblemStream {
  id: number;
  name: string | null;
  provider: string | null;
  status: StreamStatus;
}

export interface ProblemChannel {
  id: number;
  name: string;
  group: string | null;
  groupId: number | null;
  /** Streams on the channel, and how many are playable (alive, or alive at a low bitrate). */
  streams: number;
  healthy: number;
  /** What Dispatcharr serves first (slot 1). */
  first: ProblemStream | null;
  providers: string[];
}

export interface ProblemChannelsResponse {
  /** When the walk these come from ran. */
  checkedAt: number;
  channels: number;
  problems: Record<ProblemKind, ProblemChannel[]>;
}

/* ------------------------------------------------------------------------
 * Channel history: Rostrum's log of each channel's slot 1.
 * --------------------------------------------------------------------- */

/** What a channel served first: a stream's status, or "empty" when it had no streams. */
export type HeadStatus = StreamStatus | "empty";

export interface HeadStream {
  streamId: number | null;
  name: string | null;
  provider: string | null;
  status: HeadStatus;
}

/** A stretch of time slot 1 held one stream in one state. */
export interface HeadSegment extends HeadStream {
  from: number;
  to: number;
}

/** Slot 1 changed: a different stream, or the same one changing state. */
export interface HeadChange {
  at: number;
  from: HeadStream;
  to: HeadStream;
}

/** GET /api/rostrum/channels/:id/history */
export interface ChannelHistoryResponse {
  enabled: boolean;
  reason?: string;
  range: HistoryRange;
  from: number;
  to: number;
  /** When Rostrum first recorded this channel, if it has. */
  since: number | null;
  /** In time order; time between segments was not recorded (Rostrum was not running). */
  segments: HeadSegment[];
  /** Share of the recorded time slot 1 was playable (alive or low bitrate), 0–1; null with nothing recorded. */
  playableShare: number | null;
  /** Newest first. */
  changes: HeadChange[];
  /** Soaks of the streams on this channel, newest first. */
  soaks: SoakRecord[];
  /** Connect events on this channel, newest first. */
  connect: ConnectEvent[];
}

/* ------------------------------------------------------------------------
 * Dispatcharr Connect.
 * --------------------------------------------------------------------- */

/** A stream an event names, with what Rostrum knows of it (name and provider are null when it has not seen the stream). */
export interface ConnectEventStream {
  id: number;
  name: string | null;
  provider: string | null;
}

/** One Dispatcharr Connect delivery to Podium, as /api/rostrum/connect-events returns it. */
export interface ConnectEvent {
  id: number;
  /** "stream_switch" or "channel_error" (Podium's CONNECT_EVENTS); anything else is passed through. */
  event: string;
  /** Why Dispatcharr switched (buffering_timeout, max_retries_exceeded, health_monitor, manual), or the error type. */
  reason: string;
  receivedAt: number;
  /** Did Podium take it in? A rejected delivery carries Podium's `error`. */
  accepted: boolean;
  error: string | null;
  channelName: string | null;
  /** The channel, when Rostrum could match it; links to the Channels page. */
  channelId: number | null;
  /** The stream it switched away from (or that errored), and the one it switched to. */
  from: ConnectEventStream | null;
  to: ConnectEventStream | null;
}

/** The parts of Podium's Connect status the Overview card shows. */
export type ConnectStatusView = Pick<ConnectStatus, "state" | "enabled" | "pending"> & {
  summary: Pick<ConnectStatus["summary"], "accepted" | "rejected" | "lastReceivedAt" | "lastSyncAt" | "syncError">;
};

export interface ConnectEventsResponse {
  status: ConnectStatusView;
  /** Newest first: Podium keeps the last 25 from the past 14 days. */
  events: ConnectEvent[];
  /** False when the stream names could not be looked up (the ids still show). */
  named: boolean;
}

/** A stream Dispatcharr switched away from (or that errored), over a range. */
export interface SwitchedStream {
  id: number;
  name: string | null;
  provider: string | null;
  channelName: string | null;
  channelId: number | null;
  switches: number;
  lastAt: number;
}

export interface SwitchedChannel {
  name: string;
  channelId: number | null;
  switches: number;
  lastAt: number;
}

export interface SwitchProvider {
  name: string;
  /** Times one of its streams was switched away from (or errored), and switched to. */
  from: number;
  to: number;
}

/** GET /api/rostrum/connect-log: Rostrum's own record of Connect events, beyond Podium's 25. */
export interface ConnectLogResponse {
  /** False when Rostrum has nowhere to keep the log (see `reason`). */
  enabled: boolean;
  reason?: string;
  range: HistoryRange;
  from: number;
  to: number;
  /** Oldest event logged at all, if any. */
  since: number | null;
  /** Events in range, and how many count in the rankings (accepted, and not switched by hand). */
  total: number;
  counted: number;
  /** Newest first, at most CONNECT_LOG_LIMIT of `total`. */
  events: ConnectEvent[];
  streams: SwitchedStream[];
  channels: SwitchedChannel[];
  providers: SwitchProvider[];
}

export interface RefreshQueued {
  queued: true;
  scope: string;
  forcedAt: number;
}

/** What Rostrum can ask Podium to soak: one stream, or one channel's streams. */
export type SoakTarget = { scope: "stream" | "channel"; id: number };

/** POST /api/soak: what was queued. */
export interface SoakQueued {
  status: "queued";
  label: string;
  /** Streams asked for, and newly queued (fewer when some were already waiting). */
  requested: number;
  queued: number;
  /** Streams left out because their last probe found them dead (channel soaks only). */
  skippedDead: number;
  /** "manual": runs when a pass has spare capacity and nobody is watching. */
  source: string;
}

export interface RefreshCancelled {
  cancelled: boolean;
  scope: string;
}

/** GET /api/refresh: when each re-check was queued (epoch ms), keyed by group id. */
export interface RefreshMarks {
  all: number | null;
  groups: Record<string, number>;
  /** Per channel id; only from a Podium that can re-check a single channel (absent on older ones). */
  channels?: Record<string, number>;
}

/* ------------------------------------------------------------------------
 * Rostrum's own composed endpoints (/api/rostrum/*). Built by server/channels.ts
 * from Podium (and optionally Dispatcharr); never raw upstream records.
 * The server imports these type-only.
 * --------------------------------------------------------------------- */

export interface ChannelSummary {
  id: number;
  name: string;
  /** Streams Dispatcharr currently has on the channel. */
  assigned: number;
}

export interface ChannelGroup {
  id: number;
  name: string;
  channels: ChannelSummary[];
}

export interface ChannelGroupsResponse {
  /** When Podium last read Dispatcharr (epoch ms), if it says. */
  fetchedAt: number | null;
  groups: ChannelGroup[];
}

/** Where a stream's FPS / codec / audio came from. */
export type MediaSource = "podium" | "dispatcharr";

/** What Podium's probe measured, beyond height and bitrate. All nullable: never probed, or not reported. */
export interface StreamMedia {
  source: MediaSource;
  width: number | null;
  height: number | null;
  /** Frames a viewer actually gets (an interlaced feed coded as fields counts once). */
  fps: number | null;
  /** "interlaced" | "progressive" | "unknown". */
  scanType: string | null;
  videoCodec: string | null;
  videoBitrateKbps: number | null;
  /** "HDR10", "HLG", "SDR", … as Podium reports it. */
  hdr: string | null;
  audioCodec: string | null;
  audioChannels: number | null;
  channelLayout: string | null;
  audioBitrateKbps: number | null;
  /** Hz. */
  sampleRate: number | null;
}

export interface ChannelStream {
  /** Dispatcharr stream id. */
  id: number;
  /** 1-based position in Dispatcharr's current order. */
  rank: number;
  name: string;
  provider: string;
  providerGroup: string | null;
  probedAt: number | null;
  alive: boolean | null;
  black: boolean;
  /** Podium's own verdict when it reports one; null means "derive from bitrate". */
  lowBitrate: boolean | null;
  height: number | null;
  bitrateKbps: number | null;
  media: StreamMedia | null;
  /** Podium's last soak test of the stream, if it has had one. */
  soak: SoakResult | null;
}

export interface ChannelStreamsResponse {
  streams: ChannelStream[];
  details: {
    /** Is Dispatcharr configured as a fallback source for FPS / codec / audio? */
    dispatcharr: boolean;
    /** Streams with no media details (unprobed, or the source failed). */
    missing: number;
    /** Why Dispatcharr could not be read, when it could not. */
    error?: "auth" | "unreachable" | "timeout";
  };
}

/** One result of Podium's catalogue search: streams grouped under a normalised name. */
export interface StreamSearchResult {
  /** The normalised name the streams share ("Lumen One"). */
  name: string;
  /** How many streams carry it. */
  count: number;
  providers: string[];
  /** A few of the raw stream names. */
  samples: string[];
  /** Channels whose rules claim these streams; empty when no channel does. */
  channelIds: number[];
}

export interface StreamSearchResponse {
  query: string;
  /** Names matched in all; `results` may hold fewer when truncated. */
  total: number;
  truncated: boolean;
  results: StreamSearchResult[];
}

/** Every verdict state, in Podium's precedence order; the one list the server and client share. */
export const STREAM_STATES = ["alive", "low_bitrate", "black", "dead", "unmeasured"] as const;
export type StreamState = (typeof STREAM_STATES)[number];
export type ResolutionBucket = "uhd" | "fhd" | "hd" | "sd" | "unknown";

/** One provider, as Podium's /api/metrics describes it. Counts are distinct managed streams. */
export interface ProviderStats {
  name: string;
  /** Connection limit (Dispatcharr's max_streams for the account), if known. */
  maxStreams: number | null;
  streams: Record<StreamState, number>;
  /** Dead streams by why they died (not_found, timeout, …), non-zero only. */
  deadReasons: Record<string, number>;
  resolutions: Record<ResolutionBucket, number>;
  /** Median measured bitrate, overall and per resolution bucket. */
  bitrateKbps: Partial<Record<"all" | Exclude<ResolutionBucket, "unknown">, number>>;
  /** Streams whose bitrate was measured rather than declared. */
  bitrateMeasured: number | null;
  /** Median Podium score (0..1) across usable streams: the number that decides ranking. */
  score: number | null;
  verdictAgeSeconds: { median: number | null; max: number | null };
  /** Channels carrying at least one of its streams. */
  channels: number | null;
  /** Channels it serves first (slot 0), and how many of those are healthy. */
  rank1Channels: number | null;
  rank1Healthy: number | null;
}

export interface ProvidersResponse {
  providers: ProviderStats[];
}

/* ------------------------------------------------------------------------
 * Trends: snapshots Rostrum records itself (server/history.ts).
 * --------------------------------------------------------------------- */

export interface ProviderSnapshot {
  name: string;
  /** Channels it serves first, and how many of those are healthy. */
  rank1: number;
  rank1Healthy: number;
  score: number | null;
  bitrateKbps: number | null;
}

/** One moment (or, after downsampling, the average over a bucket of them). */
export interface Snapshot {
  /** Epoch ms: when it was taken, or the bucket's middle. */
  t: number;
  streams: Record<StreamState, number> & { total: number };
  primary: { total: number; healthy: number };
  freshness: { oldestSeconds: number | null; targetSeconds: number };
  providers: ProviderSnapshot[];
  /** Problem channel counts (not "not measured yet"); missing before Rostrum recorded them, or when the walk failed. */
  problems?: ProblemCounts;
}

/** The Problem channels sections Trends charts. */
export const CHARTED_PROBLEMS = ["noHealthy", "badFirst", "oneProvider", "empty"] as const;
export type ProblemCounts = Record<(typeof CHARTED_PROBLEMS)[number], number>;

export type HistoryRange = "24h" | "7d" | "30d" | "90d";

export interface HistoryResponse {
  /** False when Rostrum has nowhere to keep history (see `reason`). */
  enabled: boolean;
  reason?: string;
  range: HistoryRange;
  from: number;
  to: number;
  /** How often snapshots are taken. */
  intervalMs: number;
  /** Oldest snapshot kept at all, if any: how far back history goes. */
  since: number | null;
  points: Snapshot[];
}

/** A stream's last soak test (Podium holds it open for a while and counts drops). */
export interface SoakResult {
  completedAt: number;
  heldMs: number;
  drops: number;
  failedDials: number;
  unreachable: boolean;
}

/* ------------------------------------------------------------------------
 * Soak tests: every result Rostrum has seen, logged by server/soaks.ts
 * (Podium keeps only each stream's latest).
 * --------------------------------------------------------------------- */

/** Unreachable: Podium could not connect. Dropped: it connected but dropped or had to redial. Clean: neither. */
export type SoakVerdict = "clean" | "dropped" | "unreachable";

/** One soak result, with the stream it was for. */
export interface SoakRecord extends SoakResult {
  streamId: number;
  name: string;
  provider: string;
  /** A channel carrying the stream when the result was logged, if any. */
  channelId: number | null;
  channelName: string | null;
  verdict: SoakVerdict;
}

export interface SoakTally {
  soaks: number;
  clean: number;
  dropped: number;
  unreachable: number;
}

export interface SoakProviderSummary extends SoakTally {
  name: string;
  /** Distinct streams soaked. */
  streams: number;
  /** Median time held, over the soaks that connected. */
  medianHeldMs: number | null;
  drops: number;
}

/** A stream with at least one soak in the range that was not clean. */
export interface SoakStreamSummary extends SoakTally {
  streamId: number;
  name: string;
  provider: string;
  channelId: number | null;
  channelName: string | null;
  drops: number;
  latest: SoakRecord;
}

export interface SoaksResponse {
  /** False when Rostrum has nowhere to keep the log (see `reason`). */
  enabled: boolean;
  reason?: string;
  range: HistoryRange;
  from: number;
  to: number;
  /** Oldest soak logged at all, if any. */
  since: number | null;
  totals: SoakTally & { streams: number };
  providers: SoakProviderSummary[];
  /** Worst first: most soaks that were not clean, then most drops. */
  failing: SoakStreamSummary[];
  /** Newest first, at most RECENT_LIMIT of `totals.soaks`. */
  recent: SoakRecord[];
}

/** GET /api/soak: soak tests waiting to run, by why they were queued. */
export interface SoakQueue {
  total: number;
  /** Queued by hand. */
  manual: number;
  /** "Soak now" requests, run first. */
  now: number;
  /** Queued by Podium's own sweep of streams inside the event window. */
  sweep: number;
  streamIds: number[];
}
