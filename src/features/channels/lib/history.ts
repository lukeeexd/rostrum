import type { HeadSegment, HeadStatus, HeadStream } from "@/api/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/streamStatus";
import type { Tone } from "@/lib/tone";

export const HEAD_LABEL = (s: HeadStatus): string => (s === "empty" ? "no streams" : STATUS_LABEL[s]);
export const HEAD_TONE = (s: HeadStatus): Tone => (s === "empty" ? "neutral" : STATUS_TONE[s]);

/** "Golf HD · Provider A", "stream 8135", or "no streams". */
export function headName(h: HeadStream): string {
  if (h.streamId == null) return "no streams";
  const name = h.name || `stream ${h.streamId}`;
  return h.provider ? `${name} · ${h.provider}` : name;
}

/** A segment's place on a timeline of [from, to], as left and width percentages. */
export function placeSegment(s: Pick<HeadSegment, "from" | "to">, from: number, to: number): { left: number; width: number } {
  const span = to - from;
  if (span <= 0) return { left: 0, width: 0 };
  const left = Math.max(0, Math.min(100, ((s.from - from) / span) * 100));
  const right = Math.max(0, Math.min(100, ((s.to - from) / span) * 100));
  return { left, width: right - left };
}
