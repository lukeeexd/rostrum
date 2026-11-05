import { RiRefreshLine } from "@remixicon/react";
import { useRecheckGroup, useRefreshMarks } from "@/api/queries";
import { ConfirmShell } from "@/components/shared/ConfirmShell";
import { Button } from "@/components/ui/buttons/button";
import { useConfirmFlow } from "@/hooks/useConfirmFlow";
import { useNow } from "@/hooks/useNow";
import { formatAgo } from "@/lib/format";
import { recheckCovering } from "@/lib/recheck";

/**
 * Queue (or cancel) a re-check of one channel group. Like the whole-catalogue
 * re-check, it only expires the group's cached verdicts; Podium's paced
 * planner then measures them again within the usual provider limits.
 */
export function GroupRecheck({ groupId, groupName, channels }: { groupId: number; groupName: string; channels: number }) {
  const marks = useRefreshMarks();
  const flow = useConfirmFlow(useRecheckGroup(groupId));
  const now = useNow(30_000);
  const covering = marks.data ? recheckCovering(marks.data, { groupId }) : null;

  let status: string | undefined;
  let body = null;
  if (covering?.by === "all") {
    status = "The whole catalogue is already queued for a re-check.";
  } else if (covering) {
    status = `Re-check queued ${formatAgo(covering.at, now)}.`;
    body = (
      <Button variant="ghost" size="xs" disabled={flow.busy} onClick={flow.cancel}>
        Cancel
      </Button>
    );
  } else if (flow.confirming) {
    status = `Measure every stream in ${groupName} (${channels} ${channels === 1 ? "channel" : "channels"}) again?`;
    body = (
      <>
        <Button variant="primary" size="xs" disabled={flow.busy} onClick={flow.confirm}>
          Queue
        </Button>
        <Button variant="ghost" size="xs" disabled={flow.busy} onClick={flow.keep}>
          Keep
        </Button>
      </>
    );
  } else {
    body = (
      <Button variant="ghost" size="xs" leadingIcon={RiRefreshLine} onClick={flow.ask}>
        Re-check group…
      </Button>
    );
  }

  return (
    <div className="px-2 py-1">
      <ConfirmShell label={`Re-check ${groupName}`} flow={flow} status={status} statusFirst className="text-text-secondary">
        {body}
      </ConfirmShell>
    </div>
  );
}
