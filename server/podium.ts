import { fetchJson, fetchText, type Fetch } from "./upstream";

/**
 * The Podium reads behind Rostrum's composed pages, as narrow as the proxy:
 * fixed paths, fixed bodies, never `?refresh=1` (which would make Podium
 * re-crawl Dispatcharr). Raw shapes declare only the fields Rostrum reads.
 */

export interface PodiumState {
  fetchedAt: number;
  groups: {
    id: number;
    name: string;
    rows?: { id: number; name: string; assigned?: number }[];
  }[];
  /** Dispatcharr M3U accounts; `maxStreams` is each one's connection limit. */
  providers?: { name?: string; maxStreams?: number }[];
}

/** /api/stats, the parts history records. */
export interface PodiumStats {
  streams?: { total?: number; states?: Partial<Record<"alive" | "dead" | "black" | "low_bitrate" | "unmeasured", number>> };
  primary?: { total?: number; healthy?: number };
  freshness?: { oldestProbeAgeSeconds?: number | null; targetSeconds?: number };
}

/** /api/connect/status, the parts the events list reads. */
export interface PodiumConnectStatus {
  enabled?: boolean;
  state?: string;
  pending?: number;
  summary?: {
    accepted?: number;
    rejected?: number;
    lastReceivedAt?: number | null;
    lastSyncAt?: number | null;
    syncError?: string | null;
  };
  /** Newest first: Podium's last 25 deliveries from the past 14 days. */
  recent?: {
    id?: number;
    event?: string;
    channelName?: string | null;
    streamId?: number | null;
    previousStreamId?: number | null;
    reason?: string;
    receivedAt?: number;
    /** The HTTP status Podium answered the delivery with. */
    status?: number;
    error?: string | null;
  }[];
}

/** /api/streams: the catalogue searched by name, grouped under normalised names. */
export interface PodiumStreamSearch {
  query?: string;
  total?: number;
  truncated?: boolean;
  groups?: {
    normalized?: string;
    count?: number;
    providers?: string[];
    samples?: string[];
    claimedByChannelIds?: number[];
  }[];
}

/** One entry of /api/preview's `currentOrder`: a stream as Dispatcharr orders it, with Podium's cached verdict. */
export interface PodiumPreviewStream {
  id: number;
  raw?: string;
  provider?: string;
  providerGroup?: string | null;
  currentRank?: number | null;
  lastProbedAt?: number | null;
  lastAlive?: boolean | null;
  lastHeight?: number | null;
  lastBitrateKbps?: number | null;
  lastBlack?: boolean | null;
  /*
   * Proposed for Podium (not in 1.17): the rest of the stored probe result.
   * When present they are used in preference to Dispatcharr's stream_stats.
   */
  lastWidth?: number | null;
  lastFps?: number | null;
  lastScanType?: string | null;
  lastVideoCodec?: string | null;
  lastHdrFormat?: string | null;
  lastAudioCodec?: string | null;
  lastAudioChannels?: number | null;
  lastChannelLayout?: string | null;
  lastAudioBitrateKbps?: number | null;
  lastAudioSampleRate?: number | null;
  lastLowBitrate?: boolean | null;
  /** Podium's last soak test of the stream (store.ts StoredSoakResult), or null. */
  lastSoak?: { completedAt?: number; heldMs?: number; drops?: number; failedDials?: number; unreachable?: boolean } | null;
}

export interface PodiumPreview {
  currentOrder?: PodiumPreviewStream[];
}

const TIMEOUT_MS = 15_000;

export function createPodiumClient({ upstream, token, fetch }: { upstream: URL; token?: string; fetch: Fetch }) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return {
    state: (signal?: AbortSignal) =>
      fetchJson<PodiumState>(fetch, new URL("/api/state", upstream), { headers, timeoutMs: TIMEOUT_MS, signal }),

    /** Stream states, primary health and freshness: what the history snapshots record. */
    stats: (signal?: AbortSignal) =>
      fetchJson<PodiumStats>(fetch, new URL("/api/stats", upstream), { headers, timeoutMs: TIMEOUT_MS, signal }),

    /** Read-only despite the POST: matching plus cached verdicts, no probing, no Dispatcharr calls. */
    preview: (channelId: number, signal?: AbortSignal) =>
      fetchJson<PodiumPreview>(fetch, new URL("/api/preview", upstream), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ channelId }),
        timeoutMs: TIMEOUT_MS,
        signal,
      }),

    /** Dispatcharr Connect: the webhook's state and its latest deliveries. */
    connectStatus: (signal?: AbortSignal) =>
      fetchJson<PodiumConnectStatus>(fetch, new URL("/api/connect/status", upstream), { headers, timeoutMs: TIMEOUT_MS, signal }),

    /** Catalogue search by name; Podium needs at least 2 characters and caps `limit` at 200. */
    searchStreams: (query: string, signal?: AbortSignal) => {
      const url = new URL("/api/streams", upstream);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "200");
      return fetchJson<PodiumStreamSearch>(fetch, url, { headers, timeoutMs: TIMEOUT_MS, signal });
    },

    /** Prometheus text exposition. */
    metrics: (signal?: AbortSignal) =>
      fetchText(fetch, new URL("/api/metrics", upstream), {
        headers,
        accept: "text/plain",
        timeoutMs: TIMEOUT_MS,
        signal,
      }),
  };
}

export type PodiumClient = ReturnType<typeof createPodiumClient>;
