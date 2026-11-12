import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { progressInterval } from "@/lib/phase";
import { api } from "./client";
import type { HistoryRange, SoakTarget } from "./types";

/**
 * One query per Podium endpoint. Intervals follow Podium's own UI: progress
 * is fast while a pass runs; /api/dead walks Dispatcharr so it is slow and
 * only polled while its page is open. All polling stops in a hidden tab
 * (refetchIntervalInBackground is false by default).
 */
export const queries = {
  progress: queryOptions({
    queryKey: ["podium", "progress"],
    queryFn: ({ signal }) => api.progress(signal),
    refetchInterval: (q) => progressInterval(q.state.data?.progress.phase),
    staleTime: 1_000,
  }),
  health: queryOptions({
    queryKey: ["podium", "health"],
    queryFn: ({ signal }) => api.health(signal),
    refetchInterval: 20_000,
    staleTime: 10_000,
  }),
  stats: queryOptions({
    queryKey: ["podium", "stats"],
    queryFn: ({ signal }) => api.stats(signal),
    refetchInterval: 30_000,
    staleTime: 15_000,
  }),
  /** Dispatcharr Connect: the webhook's status and its latest events, with stream names (Rostrum's own read). */
  connectEvents: queryOptions({
    queryKey: ["rostrum", "connect-events"],
    queryFn: ({ signal }) => api.connectEvents(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  }),
  dead: queryOptions({
    queryKey: ["podium", "dead"],
    queryFn: ({ signal }) => api.dead(signal),
    refetchInterval: 120_000,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  }),
  /** Soak tests waiting to run. */
  soak: queryOptions({
    queryKey: ["podium", "soak"],
    queryFn: ({ signal }) => api.soak(signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
  }),
};

/**
 * Channels page. No polling: groups change when Dispatcharr does (Podium
 * re-reads it every 5 minutes), and a channel's streams load when opened.
 */
const CHANNEL_STREAMS = ["rostrum", "channel-streams"] as const;

export const channelQueries = {
  /** Prefix of every channel's streams query, for invalidating them all. */
  allStreams: CHANNEL_STREAMS,
  groups: queryOptions({
    queryKey: ["rostrum", "groups"],
    queryFn: ({ signal }) => api.channelGroups(signal),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  }),
  streams: (channelId: number) =>
    queryOptions({
      queryKey: [...CHANNEL_STREAMS, channelId],
      queryFn: ({ signal }) => api.channelStreams(channelId, signal),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }),
};

export const useChannelGroups = () => useQuery(channelQueries.groups);
export const useChannelStreams = (channelId: number) => useQuery(channelQueries.streams(channelId));

/** A channel's history: Rostrum's logs grow on the 5-minute beat. */
export const useChannelHistory = (channelId: number, range: HistoryRange) =>
  useQuery({
    queryKey: ["rostrum", "channel-history", channelId, range],
    queryFn: ({ signal }) => api.channelHistory(channelId, range, signal),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export const useProgress = () => useQuery(queries.progress);
export const useHealth = () => useQuery(queries.health);
export const useStats = () => useQuery(queries.stats);
export const useConnectEvents = () => useQuery(queries.connectEvents);
export const useDead = () => useQuery(queries.dead);

/** Worker state from whichever of the shell's polls has answered. */
export function useWorker() {
  const progress = useProgress();
  const health = useHealth();
  return {
    worker: progress.data?.worker ?? health.data?.worker,
    /** Both polls are failing: Rostrum cannot reach Podium at all. */
    unreachable: progress.isError && health.isError,
  };
}

/** Podium's catalogue search needs at least this many characters. */
export const MIN_SEARCH_LENGTH = 2;
export const isSearchable = (query: string) => query.trim().length >= MIN_SEARCH_LENGTH;

/** Streams search, provider comparison and re-check marks. None of them poll fast. */
export const catalogueQueries = {
  refreshMarks: queryOptions({
    queryKey: ["podium", "refresh"],
    queryFn: ({ signal }) => api.refreshMarks(signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
  }),
  search: (query: string) =>
    queryOptions({
      queryKey: ["rostrum", "streams", query.trim().toLowerCase()],
      queryFn: ({ signal }) => api.searchStreams(query.trim(), signal),
      enabled: isSearchable(query),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    }),
  providers: queryOptions({
    queryKey: ["rostrum", "providers"],
    queryFn: ({ signal }) => api.providers(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  }),
};

/** Trends: history grows by one snapshot every 5 minutes, so it refreshes on that beat. */
export const historyQuery = (range: HistoryRange) =>
  queryOptions({
    queryKey: ["rostrum", "history", range],
    queryFn: ({ signal }) => api.history(range, signal),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export const useHistory = (range: HistoryRange) => useQuery(historyQuery(range));

/** Soak page: the log gains results on the same 5-minute beat. */
export const soaksQuery = (range: HistoryRange) =>
  queryOptions({
    queryKey: ["rostrum", "soaks", range],
    queryFn: ({ signal }) => api.soaks(range, signal),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export const useSoaks = (range: HistoryRange) => useQuery(soaksQuery(range));

/** The Connect log grows on the same 5-minute beat. */
export const connectLogQuery = (range: HistoryRange) =>
  queryOptions({
    queryKey: ["rostrum", "connect-log", range],
    queryFn: ({ signal }) => api.connectLog(range, signal),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export const useConnectLog = (range: HistoryRange) => useQuery(connectLogQuery(range));

/** Flaky streams: the probe log grows on the same 5-minute beat. */
export const flakyQuery = (range: HistoryRange) =>
  queryOptions({
    queryKey: ["rostrum", "flaky", range],
    queryFn: ({ signal }) => api.flaky(range, signal),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export const useFlaky = (range: HistoryRange) => useQuery(flakyQuery(range));

/** Problem channels: from the shared preview walk, which is reused for a minute. */
export const problemsQuery = queryOptions({
  queryKey: ["rostrum", "problems"],
  queryFn: ({ signal }) => api.problems(signal),
  refetchInterval: 2 * 60_000,
  staleTime: 60_000,
  placeholderData: keepPreviousData,
});

export const useProblems = () => useQuery(problemsQuery);
export const useSoakQueue = () => useQuery(queries.soak);

/**
 * Queue (or cancel) a soak of one stream or channel. Only a stream's soak
 * can be cancelled: Podium takes soaks out of its queue by stream.
 */
export const useSoak = (target: SoakTarget) =>
  useQueueCancel(
    () => api.queueSoak(target),
    () => (target.scope === "stream" ? api.cancelSoak(target.id) : Promise.reject(new Error("only a stream's soak can be cancelled"))),
    [queries.soak.queryKey, queries.progress.queryKey],
  );
export const useRefreshMarks = () => useQuery(catalogueQueries.refreshMarks);
export const useStreamSearch = (query: string) => useQuery(catalogueQueries.search(query));
export const useProviders = () => useQuery(catalogueQueries.providers);

/** Queue and cancel mutations for one thing Podium queues (a re-check, a soak); both refresh `refresh` when they settle. */
function useQueueCancel<Q>(queue: () => Promise<Q>, cancel: () => Promise<unknown>, refresh: QueryKey[]) {
  const client = useQueryClient();
  const onSettled = () => {
    for (const queryKey of refresh) void client.invalidateQueries({ queryKey });
  };
  return {
    queue: useMutation({ mutationFn: queue, onSettled }),
    cancel: useMutation({ mutationFn: cancel, onSettled }),
  };
}

export type QueueMutations<Q = unknown> = ReturnType<typeof useQueueCancel<Q>>;

/** A re-check refreshes the marks and the pass progress. */
const useRecheck = (queue: () => Promise<unknown>, cancel: () => Promise<unknown>) =>
  useQueueCancel(queue, cancel, [catalogueQueries.refreshMarks.queryKey, queries.progress.queryKey]);

/** Queue or cancel a whole-catalogue re-check. */
export const useRecheckAll = () => useRecheck(api.queueRecheckAll, api.cancelRecheckAll);

/** Queue or cancel a re-check of one channel (Podiums that report `channels` in their marks). */
export const useRecheckChannel = (channelId: number) =>
  useRecheck(
    () => api.queueRecheckChannel(channelId),
    () => api.cancelRecheckChannel(channelId),
  );

/** Queue or cancel a re-check of one channel group. */
export const useRecheckGroup = (groupId: number) =>
  useRecheck(
    () => api.queueRecheckGroup(groupId),
    () => api.cancelRecheckGroup(groupId),
  );

