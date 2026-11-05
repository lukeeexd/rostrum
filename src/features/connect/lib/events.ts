import type { ConnectEvent, ConnectEventStream } from "@/api/types";
import type { Tone } from "@/lib/tone";

/** Dispatcharr's switch reasons, as people say them. Anything else is shown as sent. */
const REASONS: Record<string, string> = {
  buffering_timeout: "Buffering timeout",
  max_retries_exceeded: "Max retries",
  health_monitor: "Health monitor",
  manual: "Changed by hand",
};

/**
 * The chip for an event: why Dispatcharr switched, or that the channel
 * errored. A switch made by hand is neutral; Podium counts every other
 * reason against the stream it switched away from.
 */
export function eventChip(e: Pick<ConnectEvent, "event" | "reason">): { label: string; tone: Tone } {
  if (e.event === "channel_error") return { label: e.reason ? `Channel error · ${e.reason}` : "Channel error", tone: "bad" };
  return { label: REASONS[e.reason] ?? (e.reason || "Switched"), tone: e.reason === "manual" ? "neutral" : "warn" };
}

/** "Arena Sports Golf HD · Provider A", or "stream 8135" for one Rostrum has not seen. */
export function streamLabel(s: ConnectEventStream): string {
  if (!s.name) return `stream ${s.id}`;
  return s.provider ? `${s.name} · ${s.provider}` : s.name;
}
