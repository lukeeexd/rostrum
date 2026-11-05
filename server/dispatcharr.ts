import type { StreamMedia } from "../src/api/types";
import { buildMedia, num, str } from "./pick";
import { fetchJson, type Fetch } from "./upstream";

/**
 * Read-only access to the probe stats Podium writes into Dispatcharr's
 * `stream_stats` (with PODIUM_WRITE_STATS on). Only GET
 * /api/channels/streams/{id}/, and only the stats are kept: the record also
 * carries the provider `url`, whose path holds the IPTV account's username
 * and password, and that never leaves this module.
 */

/** The keys Podium's statsPayload writes (src/lib/stats.ts). Units: kbps, Hz. */
type RawStats = Partial<
  Record<
    | "width" | "height" | "source_fps" | "reported_fps" | "scan_type" | "video_codec" | "video_bitrate"
    | "hdr_format" | "audio_codec" | "audio_channels" | "channel_layout" | "audio_bitrate" | "sample_rate",
    unknown
  >
>;

/** Whitelist projection of `stream_stats`; null when Podium never wrote any. */
export function pickStats(raw: unknown): StreamMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as RawStats;
  return buildMedia("dispatcharr", {
    width: num(s.width),
    height: num(s.height),
    fps: num(s.source_fps) ?? num(s.reported_fps),
    scanType: str(s.scan_type),
    videoCodec: str(s.video_codec),
    videoBitrateKbps: num(s.video_bitrate),
    hdr: str(s.hdr_format),
    audioCodec: str(s.audio_codec),
    audioChannels: num(s.audio_channels),
    channelLayout: str(s.channel_layout),
    audioBitrateKbps: num(s.audio_bitrate),
    sampleRate: num(s.sample_rate),
  });
}

const TIMEOUT_MS = 8_000;

export function createDispatcharrClient({ url, apiKey, fetch }: { url: URL; apiKey: string; fetch: Fetch }) {
  const headers = { "x-api-key": apiKey, authorization: `Api-Key ${apiKey}` };
  return {
    /** The stream's probe stats, projected; null if it has none. `streamId` must already be a validated integer. */
    async streamMedia(streamId: number, signal?: AbortSignal): Promise<StreamMedia | null> {
      const record = await fetchJson<{ stream_stats?: unknown }>(fetch, new URL(`/api/channels/streams/${streamId}/`, url), {
        headers,
        timeoutMs: TIMEOUT_MS,
        signal,
      });
      return pickStats(record.stream_stats);
    },
  };
}

export type DispatcharrClient = ReturnType<typeof createDispatcharrClient>;
