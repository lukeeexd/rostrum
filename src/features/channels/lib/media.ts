import type { ChannelStream } from "@/api/types";
import { formatKbps } from "@/lib/format";

/**
 * Display strings for a stream's probe results. Everything returns "—" for
 * missing data and never throws on partial records.
 */

const DASH = "—";

/** "1920×1080", "1920×1080i" for interlaced, "576p" when only Podium's height is known. */
export function formatResolution(s: Pick<ChannelStream, "height" | "media">): string {
  const m = s.media;
  const height = m?.height ?? s.height;
  if (!height) return DASH;
  const i = m?.scanType === "interlaced" ? "i" : "";
  return m?.width ? `${m.width}×${height}${i}` : `${height}p`;
}

/** 25 → "25", 29.97 → "29.97", 59.940059 → "59.94". */
export function formatFps(fps: number | null | undefined): string {
  if (!fps) return DASH;
  return String(Math.round(fps * 100) / 100);
}

const LAYOUTS: Record<string, string> = { mono: "1.0", stereo: "2.0", "5.1": "5.1", "5.1(side)": "5.1", "7.1": "7.1" };

/** "2.0", "5.1", or "6ch" when only the channel count is known. */
export function formatChannels(m: ChannelStream["media"]): string {
  if (m?.channelLayout) return LAYOUTS[m.channelLayout] ?? m.channelLayout;
  return m?.audioChannels ? `${m.audioChannels}ch` : DASH;
}

/** 48000 → "48 kHz", 44100 → "44.1 kHz". */
export const formatSampleRate = (hz: number | null | undefined) => (hz ? `${Math.round(hz / 100) / 10} kHz` : DASH);

const AUDIO_CODECS: Record<string, string> = { aac: "AAC", ac3: "AC-3", eac3: "E-AC-3", mp2: "MP2", mp3: "MP3", opus: "Opus" };

/** "eac3" → "E-AC-3". */
export const formatAudioCodec = (codec: string | null | undefined) =>
  codec ? (AUDIO_CODECS[codec.toLowerCase()] ?? codec.toUpperCase()) : DASH;

/** All of it in one cell, for narrow tables: "AAC 2.0 · 128 kbps · 48 kHz". */
export function formatAudio(m: ChannelStream["media"]): string {
  if (!m) return DASH;
  const parts = [
    [m.audioCodec && formatAudioCodec(m.audioCodec), (m.channelLayout || m.audioChannels) && formatChannels(m)].filter(Boolean).join(" "),
    m.audioBitrateKbps ? formatKbps(m.audioBitrateKbps) : "",
    m.sampleRate ? formatSampleRate(m.sampleRate) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : DASH;
}

const CODECS: Record<string, string> = {
  h264: "H.264",
  hevc: "HEVC",
  h265: "HEVC",
  mpeg2video: "MPEG-2",
  mpeg4: "MPEG-4",
  av1: "AV1",
  vp9: "VP9",
};

/** ffprobe codec names as people say them: "h264" → "H.264", "mpeg2video" → "MPEG-2". */
export const formatCodec = (codec: string | null | undefined) =>
  codec ? (CODECS[codec.toLowerCase()] ?? codec.toUpperCase()) : DASH;
