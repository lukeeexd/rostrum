import type { WorkerState } from "@/api/types";
import type { Tone } from "./tone";

export const WORKER_LABEL: Record<WorkerState, string> = {
  active: "Worker active",
  stale: "Worker stale",
  absent: "No worker",
  disabled: "Worker disabled",
  unknown: "Worker unknown",
};

export const WORKER_TONE: Record<WorkerState, Tone> = {
  active: "good",
  stale: "warn",
  absent: "bad",
  disabled: "neutral",
  unknown: "bad",
};

/** What a non-active worker means, in Podium's own words, and how loudly to say it. */
export function workerNotice(worker: WorkerState | undefined): { tone: "info" | "warn"; text: string } | null {
  switch (worker) {
    case "stale":
      return { tone: "warn", text: "The worker has sent no recent heartbeat. What you see may be out of date." };
    case "absent":
      return { tone: "warn", text: "No worker has claimed the lock yet, so nothing is being checked." };
    case "unknown":
      return { tone: "warn", text: "Podium cannot read its own database, so worker state is unknown." };
    case "disabled":
      return { tone: "info", text: "The worker is disabled (PODIUM_ENABLE_WORKER=false). Nothing is being checked." };
    default:
      return null;
  }
}
