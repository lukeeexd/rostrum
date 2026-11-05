import { Link } from "react-router";
import { useSoakQueue } from "@/api/queries";
import { Card, Empty, Fact } from "@/components/shared/Card";
import { formatInt } from "@/lib/format";

/**
 * Soak tests waiting to run: Podium holds a stream open for a while and
 * counts drops, which a quick probe cannot see. The one running now is on
 * "This pass" above; results are on the Soak tests page.
 */
export function SoakQueue() {
  const { data } = useSoakQueue();
  return (
    <Card
      title="Soak tests waiting"
      actions={
        <Link
          to="/soak"
          className="rounded-sm text-body-2-medium text-text-tertiary underline underline-offset-2 outline-none hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          See results
        </Link>
      }
    >
      {!data ? null : data.total === 0 ? (
        <Empty>None. Podium queues them itself for streams inside the event window.</Empty>
      ) : (
        <dl className="grid grid-cols-3 gap-3">
          <Fact label="Soak now" value={formatInt(data.now)} sub="run first" />
          <Fact label="Event sweep" value={formatInt(data.sweep)} sub="queued by Podium" />
          <Fact label="By hand" value={formatInt(data.manual)} />
        </dl>
      )}
    </Card>
  );
}
