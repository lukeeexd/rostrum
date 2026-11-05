import type { Phase } from "@/api/types";
import type { Tone } from "./tone";

const ACTIVE: ReadonlySet<Phase> = new Set(["fetching", "planning", "probing"]);

/** A pass is doing work right now (Podium's own UI polls fast in these). */
export const isActivePhase = (phase: Phase | undefined): boolean => !!phase && ACTIVE.has(phase);

/** Poll cadence for /api/progress, matching Podium's own progress page. */
export const progressInterval = (phase: Phase | undefined): number => (isActivePhase(phase) ? 2_000 : 10_000);

export const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  fetching: "Fetching",
  planning: "Planning",
  probing: "Probing",
  soaking: "Soaking",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
};

export const PHASE_TONE: Record<Phase, Tone> = {
  idle: "neutral",
  fetching: "accent",
  planning: "accent",
  probing: "accent",
  soaking: "accent",
  paused: "warn",
  done: "good",
  failed: "bad",
};
