import type { ConnectState } from "@/api/types";
import type { Tone } from "@/lib/tone";

export const CONNECT_LABEL: Record<ConnectState, string> = {
  listening: "Listening",
  pending: "Pending",
  blocked: "Blocked",
  error: "Error",
  disabled: "Off",
};

export const connectTone = (s: ConnectState): Tone =>
  s === "listening" ? "good" : s === "pending" ? "warn" : s === "disabled" ? "neutral" : "bad";
