import { RiArrowRightLine } from "@remixicon/react";
import { useState, type ReactNode } from "react";
import { useChannelHistory } from "@/api/queries";
import type { ChannelHistoryResponse, HeadChange, HeadSegment, HistoryRange, SoakRecord } from "@/api/types";
import { Empty } from "@/components/shared/Card";
import { Notice } from "@/components/shared/Notice";
import { Paged } from "@/components/shared/Paged";
import { CardSkeleton, QueryState } from "@/components/shared/QueryState";
import { Row, RowList } from "@/components/shared/RowList";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { TONE_FILL, ToneChip } from "@/components/shared/tone";
import { ConnectEventList } from "@/features/connect/ConnectEvents";
import { VERDICT_LABEL, VERDICT_TONE } from "@/features/soak/lib/soak";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatClock, formatMs, formatPercent, orUnnamed } from "@/lib/format";
import { HISTORY_RANGES, rangeLabel } from "@/lib/ranges";
import { formatSoak } from "@/lib/soak";
import { cx } from "@/utils/cx";
import { HEAD_LABEL, HEAD_TONE, headName, placeSegment } from "./lib/history";

/**
 * One channel over time, from Rostrum's own logs: what slot 1 served and
 * whether it played, when that changed, and the soaks and Connect events
 * that concern it.
 */
export function ChannelHistory({ channelId }: { channelId: number }) {
  const [range, setRange] = useState<HistoryRange>("7d");
  const query = useChannelHistory(channelId, range);
  return (
    <section aria-label="Channel history" className="flex flex-col gap-3 border-t border-separator-border pt-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-medium text-text-secondary">History</h3>
        <SegmentedControl<HistoryRange> label="History range" value={range} onChange={setRange} options={HISTORY_RANGES} />
      </header>
      <QueryState query={query} skeleton={<CardSkeleton />}>
        {(data) => <HistoryBody key={range} data={data} />}
      </QueryState>
    </section>
  );
}

function HistoryBody({ data }: { data: ChannelHistoryResponse }) {
  const now = useNow(30_000);
  if (!data.enabled) {
    return <Notice tone="info">{data.reason} A channel&apos;s history is kept in the same database as Trends.</Notice>;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h4 className="text-caption-1-medium text-text-tertiary">Served first</h4>
        {data.segments.length === 0 ? (
          <Empty>
            Nothing recorded for this channel in the last {rangeLabel(data.range)} yet. Rostrum notes what it serves first every 5
            minutes.
          </Empty>
        ) : (
          <>
            <Timeline segments={data.segments} from={data.from} to={data.to} />
            <p className="text-body-2-medium text-text-tertiary">
              Playable {data.playableShare == null ? "—" : formatPercent(data.playableShare, 1)} of the time Rostrum recorded
              {data.since != null && ` (it started ${formatAgo(data.since, now)})`}. The bar spans the last {rangeLabel(data.range)};
              blank stretches are times nothing was recorded.
            </p>
          </>
        )}
      </div>

      {data.changes.length > 0 && (
        <Section title="Slot 1 changes" items={data.changes}>
          {(changes) => (
            <RowList label="Slot 1 changes">
              {changes.map((c) => (
                <ChangeRow key={c.at} change={c} now={now} />
              ))}
            </RowList>
          )}
        </Section>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Section title="Soaks" items={data.soaks} empty="No soaks of its streams in this range.">
          {(soaks) => (
            <RowList label="Soaks of this channel's streams">
              {soaks.map((s) => (
                <SoakRow key={`${s.streamId}-${s.completedAt}`} soak={s} now={now} />
              ))}
            </RowList>
          )}
        </Section>
        <Section title="Connect events" items={data.connect} empty="No Connect events on this channel in this range.">
          {(events) => <ConnectEventList events={events} now={now} />}
        </Section>
      </div>
    </div>
  );
}

/** A titled sub-list: its items ten at a time, or a line saying there are none. */
function Section<T>({ title, items, empty, children }: { title: string; items: T[]; empty?: string; children: (visible: T[]) => ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-caption-1-medium text-text-tertiary">{title}</h4>
      {items.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <Paged items={items} page={10}>
          {children}
        </Paged>
      )}
    </div>
  );
}

/** Slot 1 across the window: one coloured stretch per stream and state, blank where nothing was recorded. */
/** A short summary for screen readers; the detail is in the "Slot 1 changes" list below. */
function timelineLabel(segments: HeadSegment[], from: number, to: number): string {
  const last = segments.at(-1)!;
  return `What slot 1 served from ${formatClock(from)} to ${formatClock(to)}: ${segments.length} ${
    segments.length === 1 ? "stretch" : "stretches"
  } recorded, the latest ${headName(last)}, ${HEAD_LABEL(last.status)}.`;
}

function Timeline({ segments, from, to }: { segments: HeadSegment[]; from: number; to: number }) {
  const states = [...new Set(segments.map((s) => s.status))];
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={timelineLabel(segments, from, to)}
        className="relative h-3 w-full overflow-hidden rounded-full bg-background-inner-default"
      >
        {segments.map((s) => {
          const { left, width } = placeSegment(s, from, to);
          return (
            <span
              key={s.from}
              title={`${headName(s)} · ${HEAD_LABEL(s.status)} · ${formatClock(s.from)}–${formatClock(s.to)}`}
              className={cx("absolute inset-y-0", TONE_FILL[HEAD_TONE(s.status)])}
              style={{ left: `${left}%`, width: `max(${width}%, 2px)` }}
            />
          );
        })}
      </div>
      <ul aria-label="Timeline key" className="flex flex-wrap gap-x-3 gap-y-1 text-caption-1-medium text-text-tertiary">
        {states.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cx("size-2 rounded-full", TONE_FILL[HEAD_TONE(s)])} aria-hidden />
            {HEAD_LABEL(s)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeRow({ change: c, now }: { change: HeadChange; now: number }) {
  return (
    <Row className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-body-2-medium">
        {c.from.streamId === c.to.streamId ? (
          <>
            <span className="text-text-primary">{headName(c.to)}</span>
            <ToneChip tone={HEAD_TONE(c.from.status)}>{HEAD_LABEL(c.from.status)}</ToneChip>
            <RiArrowRightLine className="size-4 shrink-0 text-text-tertiary" aria-hidden />
            <span className="sr-only">became</span>
            <ToneChip tone={HEAD_TONE(c.to.status)}>{HEAD_LABEL(c.to.status)}</ToneChip>
          </>
        ) : (
          <>
            <span className="text-text-tertiary">{headName(c.from)}</span>
            <RiArrowRightLine className="size-4 shrink-0 text-text-tertiary" aria-hidden />
            <span className="sr-only">replaced by</span>
            <span className="text-text-primary">{headName(c.to)}</span>
            <ToneChip tone={HEAD_TONE(c.to.status)}>{HEAD_LABEL(c.to.status)}</ToneChip>
          </>
        )}
      </span>
      <span className="shrink-0 text-caption-1-medium text-text-tertiary tabular-nums">{formatAgo(c.at, now)}</span>
    </Row>
  );
}

function SoakRow({ soak: s, now }: { soak: SoakRecord; now: number }) {
  return (
    <Row className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-2-medium">
        <span className="min-w-0 break-words text-text-primary">
          {s.name || `stream ${s.streamId}`} · {orUnnamed(s.provider)}
        </span>
        <ToneChip tone={VERDICT_TONE[s.verdict]}>{VERDICT_LABEL[s.verdict]}</ToneChip>
        {/* The chip already says "Clean", so a clean soak shows only how long it held. */}
        {s.verdict !== "unreachable" && (
          <span className="text-text-tertiary">{s.verdict === "clean" ? `held ${formatMs(s.heldMs)}` : formatSoak(s)}</span>
        )}
      </span>
      <span className="shrink-0 text-caption-1-medium text-text-tertiary tabular-nums">{formatAgo(s.completedAt, now)}</span>
    </Row>
  );
}
