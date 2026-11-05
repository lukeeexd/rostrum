import type { Lane } from "@/api/types";

export interface LaneProgress {
  /** Podium counts a lane's completed work as done + failed. */
  completed: number;
  total: number;
  inFlight: number;
  dead: number;
  failed: number;
}

export function laneProgress(lane: Lane): LaneProgress {
  const completed = lane.done + lane.failed;
  return {
    completed,
    total: completed + lane.queued,
    inFlight: lane.current.length,
    dead: lane.dead ?? 0,
    failed: lane.failed,
  };
}

/** Held-back reasons, largest first, zeros dropped. */
export function heldBackEntries(heldBack: Record<string, number>): [reason: string, count: number][] {
  return Object.entries(heldBack)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
