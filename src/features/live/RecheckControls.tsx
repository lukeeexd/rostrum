import { RiRefreshLine } from "@remixicon/react";
import { useRecheckAll } from "@/api/queries";
import { Card } from "@/components/shared/Card";
import { Notice } from "@/components/shared/Notice";
import { Button } from "@/components/ui/buttons/button";
import { useConfirmFlow } from "@/hooks/useConfirmFlow";
import { errorText } from "@/lib/errors";
import { formatAgo, formatClock } from "@/lib/format";

/**
 * Whole-catalogue re-check. Queuing does not probe anything itself: it marks
 * every verdict as expired, and Podium's paced planner re-checks them within
 * the usual lane limits. Cancelling puts the existing verdicts back.
 */
export function RecheckControls({ queuedAt, due, now }: { queuedAt: number | null; due: number; now: number }) {
  const flow = useConfirmFlow(useRecheckAll());

  return (
    <Card title="Re-check the whole catalogue">
      {queuedAt != null ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-medium text-text-primary">
            Queued at {formatClock(queuedAt)} ({formatAgo(queuedAt, now)}). {due > 0 ? `${due} streams still to go.` : "Working through it."}
          </p>
          <Button variant="secondary" size="small" disabled={flow.busy} onClick={flow.cancel}>
            Cancel re-check
          </Button>
        </div>
      ) : flow.confirming ? (
        <div role="group" aria-label="Confirm re-check" className="flex flex-col gap-3">
          <p className="text-body-regular text-text-primary">
            Every stream will be measured again, whatever the cache says. Podium still paces it against provider limits, so
            this spends real provider connections over the next while. You can cancel it later.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="small" disabled={flow.busy} onClick={flow.confirm}>
              Queue re-check
            </Button>
            <Button variant="secondary" size="small" disabled={flow.busy} onClick={flow.keep}>
              Keep current verdicts
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-regular text-text-secondary">
            Expire every cached verdict so the next passes measure everything again, for example before a big event.
          </p>
          <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} onClick={flow.ask}>
            Re-check everything…
          </Button>
        </div>
      )}
      {flow.error && <Notice tone="bad">{errorText(flow.error)}</Notice>}
    </Card>
  );
}
