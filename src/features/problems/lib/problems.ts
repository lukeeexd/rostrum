import type { ProblemChannel, ProblemKind } from "@/api/types";
import type { Tone } from "@/lib/tone";

/** How each section reads, in the order the page shows them. */
export const SECTIONS: { kind: ProblemKind; title: string; hint: string; tone: Tone }[] = [
  { kind: "noHealthy", title: "No playable stream", hint: "Every stream Podium has measured is dead or black.", tone: "bad" },
  {
    kind: "badFirst",
    title: "Dead or black served first",
    hint: "A playable stream sits behind it, but slot 1 is not it.",
    tone: "warn",
  },
  {
    kind: "oneProvider",
    title: "One provider only",
    hint: "Every stream comes from one provider, so there is nothing to fall back to if it goes down.",
    tone: "neutral",
  },
  { kind: "empty", title: "No streams", hint: "Nothing is matched to these channels.", tone: "neutral" },
];

/** Shown folded away: not a problem yet, just unknown. */
export const UNMEASURED = {
  kind: "unmeasured" as const,
  title: "Not measured yet",
  hint: "Podium has not probed any of their streams yet; new event channels often sit here for a while.",
};

/** Channels whose name or group contains the query (case-insensitive); everything for a blank query. */
export function filterChannels(channels: ProblemChannel[], query: string): ProblemChannel[] {
  const q = query.trim().toLowerCase();
  if (!q) return channels;
  return channels.filter((c) => c.name.toLowerCase().includes(q) || (c.group ?? "").toLowerCase().includes(q));
}

/** "1 of 3 playable", "no streams". */
export function playableText(c: Pick<ProblemChannel, "streams" | "healthy">): string {
  if (c.streams === 0) return "no streams";
  return `${c.healthy} of ${c.streams} playable`;
}
