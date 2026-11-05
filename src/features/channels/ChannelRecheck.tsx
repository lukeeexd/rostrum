import { RiRefreshLine } from "@remixicon/react";
import { useRecheckChannel, useRefreshMarks } from "@/api/queries";
import { ConfirmShell } from "@/components/shared/ConfirmShell";
import { LinkButton } from "@/components/shared/LinkButton";
import { Button } from "@/components/ui/buttons/button";
import { useConfirmFlow } from "@/hooks/useConfirmFlow";
import { useNow } from "@/hooks/useNow";
import { formatAgo } from "@/lib/format";
import { recheckCovering } from "@/lib/recheck";

/**
 * Queue (or cancel) a re-check of one channel. Like the group and catalogue
 * re-checks it only expires the channel's cached verdicts; Podium's paced
 * planner measures them again within the usual provider limits.
 *
 * Shown only when Podium can re-check a single channel, which it says by
 * listing `channels` among its queued re-checks.
 */
export function ChannelRecheck({ channelId, groupId, name }: { channelId: number; groupId: number | null; name: string }) {
  const marks = useRefreshMarks();
  const flow = useConfirmFlow(useRecheckChannel(channelId));
  const now = useNow(30_000);
  if (!marks.data?.channels) return null;
  const covering = recheckCovering(marks.data, { groupId, channelId });

  let status: string | undefined;
  let body = null;
  if (covering?.by === "all" || covering?.by === "group") {
    status = `${covering.by === "all" ? "The whole catalogue" : "Its group"} is queued for a re-check.`;
  } else if (covering) {
    status = `Re-check queued ${formatAgo(covering.at, now)}`;
    body = (
      <LinkButton disabled={flow.busy} onClick={flow.cancel} aria-label={`Cancel the re-check of ${name}`}>
        Cancel
      </LinkButton>
    );
  } else if (flow.confirming) {
    status = `Measure every stream on ${name} again?`;
    body = (
      <>
        <Button variant="primary" size="xs" disabled={flow.busy} aria-label={`Queue a re-check of ${name}`} onClick={flow.confirm}>
          Queue
        </Button>
        <LinkButton disabled={flow.busy} onClick={flow.keep} aria-label={`Keep: do not re-check ${name}`}>
          Keep
        </LinkButton>
      </>
    );
  } else {
    body = (
      <Button variant="ghost" size="xs" leadingIcon={RiRefreshLine} onClick={flow.ask}>
        Re-check this channel…
      </Button>
    );
  }

  return (
    <ConfirmShell label={`Re-check ${name}`} flow={flow} status={status} statusFirst>
      {body}
    </ConfirmShell>
  );
}
