import { RiArrowRightLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { useChannelHistory } from "@/api/queries";
import type { ChannelHistoryResponse, HeadChange, HeadSegment, HistoryRange, SoakRecord, StreamProbeHistory } from "@/api/types";
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
import { formatAgo, formatClock, formatMs, formatPercent, orUnnamed, plural } from "@/lib/format";
import { HISTORY_RANGES, rangeLabel } from "@/lib/ranges";
import { formatSoak } from "@/lib/soak";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/streamStatus";
import type { Tone } from "@/lib/tone";
import { flipsAndProbes } from "@/features/flaky/lib/flaky";
import { cx } from "@/utils/cx";
import { HEAD_LABEL, HEAD_TONE, headName, placeSegment } from "./lib/history";

/**
 * One channel over time, from Rostrum's own logs: what slot 1 served and
 * whether it played, when that changed, what each of its streams' probes
 * found, and the soaks and Connect events that concern it. The range is the
 * panel's, so the streams table's Flips column covers the same stretch.
 */
export function ChannelHistory({
  channelId,
  range,
  onRange,
  names,
}: {
  channelId: number;
  range: HistoryRange;
  onRange: (range: HistoryRange) => void;
  /** Stream names by id, from the streams table. */
  names?: ReadonlyMap<number, string>;
}) {
  const query = useChannelHistory(channelId, range);
  return (
    <section aria-label="Channel history" className="flex flex-col gap-3 border-t border-separator-border pt-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-medium text-text-secondary">History</h3>
        <SegmentedControl<HistoryRange> label="History range" value={range} onChange={onRange} options={HISTORY_RANGES} />
      </header>
      <QueryState query={query} skeleton={<CardSkeleton />}>
        {(data) => <HistoryBody key={range} data={data} names={names} />}
      </QueryState>
    </section>
  );
}

function HistoryBody({ data, names }: { data: ChannelHistoryResponse; names?: ReadonlyMap<number, string> }) {
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

      <StreamProbes streams={data.streams} names={names} from={data.from} to={data.to} range={data.range} />

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

/** Stretches of [from, to] as coloured spans on one bar, blank where there are none; `label` sums it up for screen readers. */
function SegmentBar<S extends { from: number; to: number }>({
  segments,
  from,
  to,
  label,
  tone,
  title,
  className,
}: {
  segments: S[];
  from: number;
  to: number;
  label: string;
  tone: (s: S) => Tone;
  title: (s: S) => string;
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={cx("relative h-3 w-full overflow-hidden rounded-full bg-background-inner-default", className)}>
      {segments.map((s) => {
        const { left, width } = placeSegment(s, from, to);
        return (
          <span
            key={s.from}
            title={title(s)}
            className={cx("absolute inset-y-0", TONE_FILL[tone(s)])}
            style={{ left: `${left}%`, width: `max(${width}%, 2px)` }}
          />
        );
      })}
    </div>
  );
}

/** What each colour on a bar means. */
function SegmentKey({ label, items }: { label: string; items: { tone: Tone; text: string }[] }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-3 gap-y-1 text-caption-1-medium text-text-tertiary">
      {items.map((i) => (
        <li key={i.text} className="flex items-center gap-1.5">
          <span className={cx("size-2 rounded-full", TONE_FILL[i.tone])} aria-hidden />
          {i.text}
        </li>
      ))}
    </ul>
  );
}

/** A short summary for screen readers; the detail is in the "Slot 1 changes" list below. */
function timelineLabel(segments: HeadSegment[], from: number, to: number): string {
  const last = segments.at(-1)!;
  return `What slot 1 served from ${formatClock(from)} to ${formatClock(to)}: ${plural(segments.length, "stretch", "stretches")} recorded, the latest ${headName(last)}, ${HEAD_LABEL(last.status)}.`;
}

/** Slot 1 across the window: one coloured stretch per stream and state, blank where nothing was recorded. */
function Timeline({ segments, from, to }: { segments: HeadSegment[]; from: number; to: number }) {
  const states = [...new Set(segments.map((s) => s.status))];
  return (
    <div className="flex flex-col gap-1.5">
      <SegmentBar
        segments={segments}
        from={from}
        to={to}
        label={timelineLabel(segments, from, to)}
        tone={(s) => HEAD_TONE(s.status)}
        title={(s) => `${headName(s)} · ${HEAD_LABEL(s.status)} · ${formatClock(s.from)}–${formatClock(s.to)}`}
      />
      <SegmentKey label="Timeline key" items={states.map((s) => ({ tone: HEAD_TONE(s), text: HEAD_LABEL(s) }))} />
    </div>
  );
}

/** Each stream's probes across the window: one strip per stream, coloured by what each probe found until the next. */
function StreamProbes({
  streams,
  names,
  from,
  to,
  range,
}: {
  streams: StreamProbeHistory[];
  names?: ReadonlyMap<number, string>;
  from: number;
  to: number;
  range: HistoryRange;
}) {
  const logged = streams.filter((s) => s.segments.length > 0);
  const states = [...new Set(logged.flatMap((s) => s.segments.map((g) => g.status)))];
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-caption-1-medium text-text-tertiary">Probes of its streams</h4>
      {logged.length === 0 ? (
        <Empty>No probes of its streams logged in the last {rangeLabel(range)} yet. Podium probes each about once a day.</Empty>
      ) : (
        <>
          <ul aria-label="Probes of its streams" className="flex flex-col gap-2">
            {logged.map((s) => {
              const name = names?.get(s.streamId) || `stream ${s.streamId}`;
              return (
                <li key={s.streamId} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]">
                  <span className="truncate text-body-2-medium text-text-secondary" title={name}>
                    {name}
                  </span>
                  <SegmentBar
                    segments={s.segments}
                    from={from}
                    to={to}
                    label={`${name}: ${flipsAndProbes(s)}, latest ${STATUS_LABEL[s.segments.at(-1)!.status]}.`}
                    tone={(g) => STATUS_TONE[g.status]}
                    title={(g) => `${STATUS_LABEL[g.status]} · ${formatClock(g.from)}–${formatClock(g.to)}`}
                    className="h-2.5"
                  />
                  <span className="text-caption-1-medium text-text-tertiary tabular-nums">{flipsAndProbes(s)}</span>
                </li>
              );
            })}
          </ul>
          <SegmentKey label="Probe key" items={states.map((st) => ({ tone: STATUS_TONE[st], text: STATUS_LABEL[st] }))} />
          <p className="text-body-2-medium text-text-tertiary">
            Each stretch runs from one probe to the next. A flip is a change between playable (alive, low bitrate) and broken
            (dead, black); blank is before the first probe Rostrum has.
          </p>
        </>
      )}
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
