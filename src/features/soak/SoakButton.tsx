import { RiTimerLine } from "@remixicon/react";
import { useSoak, useSoakQueue } from "@/api/queries";
import type { SoakQueued, SoakTarget } from "@/api/types";
import { ConfirmShell } from "@/components/shared/ConfirmShell";
import { LinkButton } from "@/components/shared/LinkButton";
import { Button } from "@/components/ui/buttons/button";
import { useConfirmFlow } from "@/hooks/useConfirmFlow";
import { formatInt } from "@/lib/format";

/**
 * Ask Podium to soak one stream or one channel: hold it open for a while and
 * count drops. It only queues: Podium runs it when a pass has spare capacity
 * and nobody is watching. Asks first, like the re-check, and a queued stream
 * can be taken back out.
 *
 * `compact` is for a table cell: a quiet link, and a one-word confirmation.
 * Focus, Escape and announcements come from ConfirmShell.
 */
export function SoakButton({ target, name, compact }: { target: SoakTarget; name: string; compact?: boolean }) {
  const mutations = useSoak(target);
  const flow = useConfirmFlow(mutations);
  const { data: waiting, dataUpdatedAt } = useSoakQueue();

  const queued = mutations.queue.data;
  // Queued by this button and not yet in a fresher read of the queue (or the queue cannot be read): trust the answer Podium gave.
  const justQueued = queued != null && !mutations.cancel.isSuccess && (waiting == null || dataUpdatedAt < mutations.queue.submittedAt);
  const queuedStream = target.scope === "stream" && ((waiting?.streamIds.includes(target.id) ?? false) || justQueued);
  const phase = queuedStream ? "queued" : flow.confirming ? "confirming" : "idle";

  let body;
  if (phase === "queued") {
    body = (
      <>
        <LinkButton disabled={flow.busy} onClick={flow.cancel} aria-label={`Cancel the soak of ${name}`}>
          Cancel
        </LinkButton>
      </>
    );
  } else if (phase === "confirming") {
    body = (
      <>
        <Button variant="primary" size="xs" disabled={flow.busy} aria-label={`Queue a soak of ${name}`} onClick={flow.confirm}>
          Queue
        </Button>
        <LinkButton disabled={flow.busy} onClick={flow.keep} aria-label={`Keep: do not soak ${name}`}>
          Keep
        </LinkButton>
      </>
    );
  } else if (compact) {
    // In a table cell, one quiet link per row rather than a column of buttons.
    body = (
      <LinkButton aria-label={`Soak ${name}…`} onClick={flow.ask}>
        Soak…
      </LinkButton>
    );
  } else {
    body = (
      <Button variant="ghost" size="xs" leadingIcon={RiTimerLine} onClick={flow.ask}>
        Soak this {target.scope}…
      </Button>
    );
  }

  // The confirmation's question, "Soak queued" for a stream, or what a channel soak queued.
  const status =
    phase === "confirming"
      ? compact
        ? "Soak?"
        : `Soak ${name}?`
      : phase === "queued"
        ? "Soak queued"
        : target.scope === "channel" && queued
          ? queuedText(queued)
          : undefined;
  return (
    <ConfirmShell label={`Soak ${name}`} flow={flow} status={status} statusFirst={phase !== "idle"}>
      {body}
    </ConfirmShell>
  );
}

/** "Queued 3 streams, 1 dead one left out; Podium runs them when there is room and nobody is watching." */
export function queuedText(r: Pick<SoakQueued, "queued" | "requested" | "skippedDead">): string {
  const already = r.requested - r.queued;
  const parts = [`Queued ${formatInt(r.queued)} ${r.queued === 1 ? "stream" : "streams"}`];
  if (already > 0) parts.push(`${formatInt(already)} already waiting`);
  if (r.skippedDead > 0) parts.push(`${formatInt(r.skippedDead)} dead ${r.skippedDead === 1 ? "one" : "ones"} left out`);
  return `${parts.join(", ")}; Podium runs them when there is room and nobody is watching.`;
}
