import { useProgress } from "@/api/queries";
import type { Lane, ProgressResponse } from "@/api/types";
import { Card, Empty, Fact, Tile } from "@/components/shared/Card";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { QueryState } from "@/components/shared/QueryState";
import { ToneChip } from "@/components/shared/tone";
import { WorkerNotice } from "@/components/shared/WorkerNotice";
import { Chip } from "@/components/ui/badges/chip";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatCountdown, formatInt } from "@/lib/format";
import { isActivePhase, PHASE_LABEL, PHASE_TONE } from "@/lib/phase";
import { heldBackEntries, laneProgress } from "./lib/lanes";
import { RecheckControls } from "./RecheckControls";
import { SoakQueue } from "./SoakQueue";

export function LivePage() {
  const progress = useProgress();
  return <QueryState query={progress}>{(data) => <LiveBody data={data} />}</QueryState>;
}

function LiveBody({ data }: { data: ProgressResponse }) {
  const now = useNow(1000);
  const p = data.progress;
  const active = isActivePhase(p.phase);

  return (
    <>
      <WorkerNotice worker={data.worker} />

      <Card
        title="This pass"
        actions={
          <ToneChip tone={PHASE_TONE[p.phase]} dot pulse={active}>
            {PHASE_LABEL[p.phase]}
          </ToneChip>
        }
      >
        <div className="flex flex-col gap-1">
          <p className="text-title-3-medium text-text-primary">{headline(data)}</p>
          <p className="text-body-2-medium text-text-tertiary">
            {p.message && <>{p.message} · </>}
            {p.startedAt ? `started ${formatAgo(p.startedAt, now)}` : "no pass yet"}
            {" · "}next pass {formatCountdown(p.nextRunAt, now)}
          </p>
        </div>

        {p.total > 0 && (
          <ProgressBar
            label="Probed"
            value={p.probed}
            max={p.total}
            valueLabel={`${formatInt(p.probed)} / ${formatInt(p.total)}`}
          />
        )}
        {!!p.soakTotal && (
          <ProgressBar
            label={`Soak test${p.soakDrops ? ` · ${p.soakDrops} dropped` : ""}`}
            value={p.soaked ?? 0}
            max={p.soakTotal}
            valueLabel={`${formatInt(p.soaked ?? 0)} / ${formatInt(p.soakTotal)}`}
            tone={p.soakDrops ? "warn" : "accent"}
          />
        )}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Probed" value={formatInt(p.probed)} />
          <Fact label="Dead" value={formatInt(p.dead)} />
          <Fact label="Reordered" value={formatInt(p.reordered)} />
          <Fact label="Already in order" value={formatInt(p.unchanged ?? 0)} />
          <Fact label="From cache" value={formatInt(p.cached)} />
          <Fact label="Deferred" value={formatInt(p.deferred)} />
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <RecheckControls queuedAt={data.refresh.all} due={data.stats.cache.due} now={now} />
        <HeldBack heldBack={p.heldBack} />
        <SoakQueue />
      </div>

      <Card title="Provider lanes">
        {p.lanes.length === 0 ? (
          <Empty>
            {active ? "Planning which streams each provider will probe…" : "No provider lanes are running. They appear while a pass probes streams."}
          </Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {p.lanes.map((lane) => (
              <LaneTile key={lane.id} lane={lane} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function headline({ progress: p, stats }: ProgressResponse): string {
  if (p.phase === "probing" && p.total > 0) return `Probing ${formatInt(p.total)} streams`;
  if (isActivePhase(p.phase)) return `${PHASE_LABEL[p.phase]}…`;
  if (p.phase === "failed") return "The last pass failed";
  if (stats.cache.due > 0) return `${formatInt(stats.cache.due)} streams are waiting to be checked`;
  if (stats.cache.total === 0) return "Nothing checked yet";
  return "Everything is checked";
}

function HeldBack({ heldBack }: { heldBack: Record<string, number> }) {
  const entries = heldBackEntries(heldBack);
  return (
    <Card title="Held back this pass">
      {entries.length === 0 ? (
        <Empty>Nothing was held back.</Empty>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {entries.map(([reason, n]) => (
            <li key={reason}>
              <Chip variant="subtle" color="soft">
                <span className="tabular-nums text-text-primary">{formatInt(n)}</span>&nbsp;{reason}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LaneTile({ lane }: { lane: Lane }) {
  const lp = laneProgress(lane);
  return (
    <Tile className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-body-semibold text-text-primary">{lane.name}</span>
        <Chip variant="caption" color="neutral" className="tabular-nums">
          {lp.inFlight}/{lane.limit} connections
        </Chip>
      </div>
      <ProgressBar
        label={`${formatInt(lane.queued)} queued`}
        value={lp.completed}
        max={lp.total}
        valueLabel={`${formatInt(lp.completed)} / ${formatInt(lp.total)}`}
        tone={lp.failed ? "warn" : "accent"}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-2-medium text-text-secondary">
        <span>
          dead <span className="tabular-nums text-text-primary">{lp.dead}</span>
        </span>
        <span>
          failed <span className="tabular-nums text-text-primary">{lp.failed}</span>
        </span>
      </div>
      {lane.current.length > 0 && (
        <ul aria-label={`Probing now on ${lane.name}`} className="flex flex-wrap gap-1.5">
          {lane.current.map((name, i) => (
            <li key={`${i}-${name}`}>
              <Chip variant="caption" color="blue">
                {name}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
