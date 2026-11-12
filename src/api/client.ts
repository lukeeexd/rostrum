import type {
  ChannelGroupsResponse,
  ChannelHistoryResponse,
  ChannelStreamsResponse,
  ConnectEventsResponse,
  ConnectLogResponse,
  DeadResponse,
  Health,
  HistoryRange,
  HistoryResponse,
  FlakyResponse,
  ProblemChannelsResponse,
  ProgressResponse,
  ProvidersResponse,
  RefreshCancelled,
  RefreshMarks,
  RefreshQueued,
  SoakQueue,
  SoakQueued,
  SoakTarget,
  SoaksResponse,
  Stats,
  StreamSearchResponse,
} from "./types";

/** A failed call to Rostrum's /api proxy (and through it, Podium). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: string,
  ) {
    super(describe(status, path, detail));
    this.name = "ApiError";
  }
}

function describe(status: number, path: string, detail: string): string {
  if (status === 0) return `Could not reach Rostrum (${path}): ${detail}`;
  if (status === 502) return "Podium is unreachable from Rostrum.";
  if (status === 504) return "Podium took too long to answer.";
  if (status === 401) return "Podium refused the token. Check PODIUM_TOKEN.";
  return `${path} failed with ${status}${detail ? `: ${detail}` : ""}`;
}

/** Same-origin call to the proxy. Throws ApiError on anything but JSON 2xx. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { accept: "application/json", ...init.headers } });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, path, (err as Error).message);
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 200);
    try {
      detail = (JSON.parse(text) as { error?: string }).error ?? detail;
    } catch {
      /* not JSON: keep the raw text */
    }
    throw new ApiError(res.status, path, detail);
  }
  // A misrouted request gets the SPA's index.html with a 200; don't parse that as data.
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(res.status, path, "expected JSON, got " + (res.headers.get("content-type") ?? "nothing"));
  }
  // Provider URLs are already redacted by the server (server/proxy.ts).
  return JSON.parse(text) as T;
}

const get = <T>(path: string) => (signal?: AbortSignal) => request<T>(path, { signal });

export const api = {
  health: get<Health>("/api/health"),
  stats: get<Stats>("/api/stats"),
  progress: get<ProgressResponse>("/api/progress"),
  dead: get<DeadResponse>("/api/dead"),
  connectEvents: get<ConnectEventsResponse>("/api/rostrum/connect-events"),
  connectLog: (range: HistoryRange, signal?: AbortSignal) =>
    request<ConnectLogResponse>(`/api/rostrum/connect-log?range=${range}`, { signal }),
  problems: get<ProblemChannelsResponse>("/api/rostrum/problems"),
  flaky: (range: HistoryRange, signal?: AbortSignal) => request<FlakyResponse>(`/api/rostrum/flaky?range=${range}`, { signal }),
  channelGroups: get<ChannelGroupsResponse>("/api/rostrum/groups"),
  channelHistory: (channelId: number, range: HistoryRange, signal?: AbortSignal) =>
    request<ChannelHistoryResponse>(`/api/rostrum/channels/${channelId}/history?range=${range}`, { signal }),
  channelStreams: (channelId: number, signal?: AbortSignal) =>
    request<ChannelStreamsResponse>(`/api/rostrum/channels/${channelId}/streams`, { signal }),
  queueRecheckAll: () =>
    request<RefreshQueued>("/api/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "all" }),
    }),
  cancelRecheckAll: () => request<RefreshCancelled>("/api/refresh?scope=all", { method: "DELETE" }),
  /** Which re-checks are queued: the whole catalogue, and per group id. */
  refreshMarks: get<RefreshMarks>("/api/refresh"),
  queueRecheckGroup: (groupId: number) =>
    request<RefreshQueued>("/api/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "group", groupId }),
    }),
  cancelRecheckGroup: (groupId: number) =>
    request<RefreshCancelled>(`/api/refresh?scope=group&groupId=${groupId}`, { method: "DELETE" }),
  queueRecheckChannel: (channelId: number) =>
    request<RefreshQueued>("/api/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "channel", channelId }),
    }),
  cancelRecheckChannel: (channelId: number) =>
    request<RefreshCancelled>(`/api/refresh?scope=channel&channelId=${channelId}`, { method: "DELETE" }),
  searchStreams: (query: string, signal?: AbortSignal) =>
    request<StreamSearchResponse>(`/api/rostrum/streams?q=${encodeURIComponent(query)}`, { signal }),
  providers: get<ProvidersResponse>("/api/rostrum/providers"),
  history: (range: HistoryRange, signal?: AbortSignal) =>
    request<HistoryResponse>(`/api/rostrum/history?range=${range}`, { signal }),
  soak: get<SoakQueue>("/api/soak"),
  /** Queue a soak of one stream or one channel; Podium runs it when there is room and nobody is watching. */
  queueSoak: (target: SoakTarget) =>
    request<SoakQueued>("/api/soak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(target),
    }),
  /** Take one stream out of the soak queue. */
  cancelSoak: (streamId: number) => request<unknown>(`/api/soak?streamId=${streamId}`, { method: "DELETE" }),
  soaks: (range: HistoryRange, signal?: AbortSignal) =>
    request<SoaksResponse>(`/api/rostrum/soaks?range=${range}`, { signal }),
};
