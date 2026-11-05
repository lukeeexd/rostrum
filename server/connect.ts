import type {
  ConnectEvent,
  ConnectEventsResponse,
  ConnectEventStream,
  ConnectState,
  ConnectStatusView,
} from "../src/api/types";
import { withinOrNull } from "./load";
import { id, num, str } from "./pick";
import type { PodiumClient, PodiumConnectStatus } from "./podium";
import type { StreamIndex } from "./streams-index";

/**
 * Dispatcharr Connect for the Overview card and the History page: Podium's
 * webhook status and its latest deliveries, with names. Deliveries carry
 * stream ids only, so they are named from the shared preview walk. Fields are
 * picked explicitly and every string is redacted (an error can quote a
 * provider URL).
 */

/** How long a request waits for names before answering with ids; the walk carries on for the next one. */
export const NAMES_DEADLINE_MS = 1_500;

const CONNECT_STATES: readonly ConnectState[] = ["disabled", "blocked", "pending", "error", "listening"];
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

function projectStatus(raw: PodiumConnectStatus): ConnectStatusView {
  const s = raw.summary ?? {};
  const state = CONNECT_STATES.find((c) => c === raw.state) ?? (raw.enabled === false ? "disabled" : "error");
  return {
    state,
    enabled: raw.enabled !== false,
    pending: count(raw.pending),
    summary: {
      accepted: count(s.accepted),
      rejected: count(s.rejected),
      lastReceivedAt: num(s.lastReceivedAt),
      lastSyncAt: num(s.lastSyncAt),
      syncError: str(s.syncError),
    },
  };
}

function streamRef(streamId: unknown, index: StreamIndex | null): ConnectEventStream | null {
  const sid = id(streamId);
  if (sid == null) return null;
  const known = index?.streams.get(sid);
  return { id: sid, name: known?.name ?? null, provider: known?.provider ?? null };
}

export function projectConnectEvents(raw: PodiumConnectStatus, index: StreamIndex | null): ConnectEventsResponse {
  const events = (raw.recent ?? []).flatMap((e): ConnectEvent[] => {
    const eventId = id(e.id);
    const receivedAt = num(e.receivedAt);
    if (eventId == null || receivedAt == null) return [];
    const from = streamRef(e.previousStreamId, index);
    const to = streamRef(e.streamId, index);
    // A channel_error names the stream that failed in `streamId`; there is nothing to switch to.
    const errored = e.event === "channel_error";
    const channelName = str(e.channelName);
    const status = typeof e.status === "number" ? e.status : null;
    const error = str(e.error);
    return [
      {
        id: eventId,
        event: str(e.event) ?? "",
        reason: str(e.reason) ?? "",
        receivedAt,
        accepted: error == null && (status == null || (status >= 200 && status < 300)),
        error,
        channelName,
        // null when no channel has that name, or more than one does (the link would be a guess).
        channelId: channelName ? (index?.channelsByName.get(channelName) ?? null) : null,
        from: errored ? (to ?? from) : from,
        to: errored ? null : to,
      },
    ];
  });
  return { status: projectStatus(raw), events, named: index != null };
}

export function createConnectEvents({
  podium,
  streams,
  namesDeadlineMs = NAMES_DEADLINE_MS,
}: {
  podium: PodiumClient;
  /** The shared preview walk (streams-index.ts). */
  streams: () => Promise<StreamIndex>;
  namesDeadlineMs?: number;
}) {
  return {
    /**
     * Status and latest deliveries. Names come from the walk if it answers in
     * time (or failed recently); ids otherwise. The history tick passes
     * `waitForNames`, since nobody is waiting on it.
     */
    async recent(signal?: AbortSignal, { waitForNames = false } = {}): Promise<ConnectEventsResponse> {
      const names = waitForNames ? streams().catch(() => null) : withinOrNull(streams(), namesDeadlineMs);
      const [status, index] = await Promise.all([podium.connectStatus(signal), names]);
      return projectConnectEvents(status, index);
    },
  };
}

export type ConnectEventsService = ReturnType<typeof createConnectEvents>;
