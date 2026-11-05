import type { ChannelStream } from "../api/types";
import type { Tone } from "./tone";

/** A stream's state as Podium judges it, in one vocabulary for every page (and the server: relative imports only). */
export type StreamStatus = "unprobed" | "dead" | "black" | "low_bitrate" | "alive";

export const STATUS_LABEL: Record<StreamStatus, string> = {
  unprobed: "not probed",
  dead: "dead",
  black: "black screen",
  low_bitrate: "low bitrate",
  alive: "alive",
};

export const STATUS_TONE: Record<StreamStatus, Tone> = {
  unprobed: "neutral",
  dead: "bad",
  black: "bad",
  low_bitrate: "warn",
  alive: "good",
};

/**
 * Podium's default bitrate floor (scoring.ts DEFAULT_WEIGHTS.minBitrateKbps).
 * Used only until Podium's preview reports its own lowBitrate verdict, since
 * an instance can configure a different floor that Podium does not expose.
 */
export const DEFAULT_MIN_BITRATE_KBPS = 500;

/** Worst problem first, as Podium ranks them: dead and black sink, then low bitrate. */
export function streamStatus(s: Pick<ChannelStream, "probedAt" | "alive" | "black" | "lowBitrate" | "bitrateKbps">): StreamStatus {
  if (s.probedAt == null || s.alive == null) return "unprobed";
  if (!s.alive) return "dead";
  if (s.black) return "black";
  const low = s.lowBitrate ?? (s.bitrateKbps != null && s.bitrateKbps < DEFAULT_MIN_BITRATE_KBPS);
  return low ? "low_bitrate" : "alive";
}

