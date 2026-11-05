import { useState } from "react";
import type { QueueMutations } from "@/api/queries";

/**
 * The ask → confirm → queue, or cancel, flow behind every control that asks
 * Podium to queue something (the re-checks, the soaks), so they cannot drift
 * apart. Each step clears the other mutation's leftover error.
 */
export function useConfirmFlow<Q>({ queue, cancel }: QueueMutations<Q>) {
  const [confirming, setConfirming] = useState(false);
  const clear = () => {
    queue.reset();
    cancel.reset();
  };
  return {
    confirming,
    busy: queue.isPending || cancel.isPending,
    error: queue.error ?? cancel.error,
    /** Show the confirmation. */
    ask: () => {
      clear();
      setConfirming(true);
    },
    /** Back out of the confirmation without queuing anything. */
    keep: () => {
      clear();
      setConfirming(false);
    },
    /** Queue it; the confirmation closes once Podium accepts it. */
    confirm: () => {
      cancel.reset();
      queue.mutate(undefined, { onSuccess: () => setConfirming(false) });
    },
    /** Cancel what was queued. */
    cancel: () => {
      queue.reset();
      cancel.mutate();
    },
  };
}
