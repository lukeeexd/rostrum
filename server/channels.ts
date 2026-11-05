import type {
  ChannelGroupsResponse,
  ChannelStream,
  ChannelStreamsResponse,
  StreamMedia,
} from "../src/api/types";
import type { DispatcharrClient } from "./dispatcharr";
import { buildMedia, id, num, str } from "./pick";
import type { PodiumClient, PodiumPreviewStream, PodiumState } from "./podium";
import { createLimiter, shared, untilAborted } from "./load";
import { classify } from "./upstream";

/**
 * The Channels page's data: groups and channels from Podium's state, and for
 * one channel its streams in Dispatcharr order with Podium's probe results.
 * Every field is picked explicitly, never spread, so nothing from the raw
 * records (profile patterns, stream URLs) can reach the browser.
 */

export function projectGroups(state: PodiumState): ChannelGroupsResponse {
  return {
    fetchedAt: num(state.fetchedAt),
    groups: (state.groups ?? []).flatMap((g) => {
      const groupId = id(g.id);
      if (groupId == null) return [];
      return [
        {
          id: groupId,
          name: str(g.name) ?? "",
          channels: (g.rows ?? []).flatMap((r) => {
            const channelId = id(r.id);
            return channelId == null ? [] : [{ id: channelId, name: str(r.name) ?? "", assigned: num(r.assigned) ?? 0 }];
          }),
        },
      ];
    }),
  };
}

/** Podium's own media fields, once its preview carries them (the proposed `last*` additions). */
export function mediaFromPreview(s: PodiumPreviewStream): StreamMedia | null {
  if (s.lastFps === undefined && s.lastVideoCodec === undefined && s.lastAudioCodec === undefined) return null;
  return buildMedia("podium", {
    width: num(s.lastWidth),
    height: num(s.lastHeight),
    fps: num(s.lastFps),
    scanType: str(s.lastScanType),
    videoCodec: str(s.lastVideoCodec),
    videoBitrateKbps: num(s.lastBitrateKbps),
    hdr: str(s.lastHdrFormat),
    audioCodec: str(s.lastAudioCodec),
    audioChannels: num(s.lastAudioChannels),
    channelLayout: str(s.lastChannelLayout),
    audioBitrateKbps: num(s.lastAudioBitrateKbps),
    sampleRate: num(s.lastAudioSampleRate),
  });
}

export function projectStream(s: PodiumPreviewStream & { id: number }, index: number, media: StreamMedia | null): ChannelStream {
  return {
    id: s.id,
    rank: num(s.currentRank) ?? index + 1,
    name: str(s.raw) ?? "",
    provider: str(s.provider) ?? "",
    providerGroup: str(s.providerGroup),
    probedAt: num(s.lastProbedAt),
    alive: typeof s.lastAlive === "boolean" ? s.lastAlive : null,
    black: s.lastBlack === true,
    lowBitrate: typeof s.lastLowBitrate === "boolean" ? s.lastLowBitrate : null,
    height: num(s.lastHeight),
    bitrateKbps: num(s.lastBitrateKbps),
    media,
    soak: projectSoak(s.lastSoak),
  };
}

/** A soak result only counts if Podium says when it finished; counts default to 0. */
export function projectSoak(raw: PodiumPreviewStream["lastSoak"]): ChannelStream["soak"] {
  const completedAt = num(raw?.completedAt);
  if (!raw || completedAt == null) return null;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    completedAt,
    heldMs: count(raw.heldMs),
    drops: count(raw.drops),
    failedDials: count(raw.failedDials),
    unreachable: raw.unreachable === true,
  };
}

/** Dispatcharr is Django on a small worker pool; Podium found a handful in flight is the sweet spot. */
const DISPATCHARR_SLOTS = 4;
/** Bounds a whole channel request, queueing included. */
const STREAMS_DEADLINE_MS = 20_000;

export interface ChannelsDeps {
  podium: PodiumClient;
  dispatcharr?: DispatcharrClient;
  now?: () => number;
}

export function createChannelsService({ podium, dispatcharr, now = Date.now }: ChannelsDeps) {
  const limit = createLimiter(DISPATCHARR_SLOTS);
  // Podium already caches its state for 5 minutes; this just stops a burst of
  // page loads (or a hostile LAN client) turning into a burst of Podium calls.
  const groups = shared<"state", ChannelGroupsResponse>(10_000, 1, now);
  const stats = shared<number, StreamMedia | null>(60_000, 5_000, now);

  function statsFor(streamId: number, signal: AbortSignal): Promise<StreamMedia | null> {
    const load = stats(streamId, () =>
      limit(async () => {
        try {
          return await dispatcharr!.streamMedia(streamId);
        } catch (err) {
          // A stream Dispatcharr no longer has simply has no stats.
          if (classify(err) === "not_found") return null;
          throw err;
        }
      }),
    );
    return untilAborted(load, signal);
  }

  return {
    groups(signal?: AbortSignal): Promise<ChannelGroupsResponse> {
      return untilAborted(
        groups("state", async () => projectGroups(await podium.state())),
        signal,
      );
    },

    async streams(channelId: number, signal?: AbortSignal): Promise<ChannelStreamsResponse> {
      const deadline = AbortSignal.timeout(STREAMS_DEADLINE_MS);
      const bounded = signal ? AbortSignal.any([deadline, signal]) : deadline;
      const preview = await podium.preview(channelId, bounded);
      // Only streams with a usable id: it goes into a Dispatcharr URL.
      const order = (preview.currentOrder ?? []).flatMap((s) => {
        const streamId = id(s.id);
        return streamId == null ? [] : [{ ...s, id: streamId }];
      });
      let error: ChannelStreamsResponse["details"]["error"];

      const media = await Promise.all(
        order.map(async (s) => {
          const own = mediaFromPreview(s);
          if (own || !dispatcharr || s.lastProbedAt == null) return own;
          try {
            return await statsFor(s.id, bounded);
          } catch (err) {
            const why = classify(err);
            error ??= why === "auth" || why === "timeout" ? why : "unreachable";
            return null;
          }
        }),
      );

      const streams = order.map((s, i) => projectStream(s, i, media[i]));
      return {
        streams,
        details: {
          dispatcharr: Boolean(dispatcharr),
          missing: streams.filter((s) => !s.media).length,
          ...(error ? { error } : {}),
        },
      };
    },
  };
}

export type ChannelsService = ReturnType<typeof createChannelsService>;
