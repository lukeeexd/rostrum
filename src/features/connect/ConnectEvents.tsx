import { RiArrowRightLine } from "@remixicon/react";
import type { ConnectEvent } from "@/api/types";
import { ChannelLink } from "@/components/shared/ChannelLink";
import { Row, RowList } from "@/components/shared/RowList";
import { ToneChip } from "@/components/shared/tone";
import { formatAgo } from "@/lib/format";
import { eventChip, streamLabel } from "./lib/events";

/**
 * What Dispatcharr told Podium while people were watching: a stream that
 * failed and what it switched to, or a channel that errored. Names come from
 * Rostrum's walk of the channel previews; Podium sends ids only.
 */
export function ConnectEventList({ events, now }: { events: ConnectEvent[]; now: number }) {
  return (
    <RowList label="Dispatcharr Connect events">
      {events.map((e) => (
        <EventRow key={e.id} event={e} now={now} />
      ))}
    </RowList>
  );
}

function EventRow({ event: e, now }: { event: ConnectEvent; now: number }) {
  const chip = eventChip(e);
  return (
    <Row className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-body-semibold text-text-primary">
            {e.channelId != null ? (
              <ChannelLink id={e.channelId} name={e.channelName} className="text-text-primary!" />
            ) : (
              e.channelName || "Unknown channel"
            )}
          </span>
          <ToneChip tone={chip.tone}>{chip.label}</ToneChip>
          {!e.accepted && <ToneChip tone="bad">Rejected</ToneChip>}
        </div>
        <span className="shrink-0 text-caption-1-medium text-text-tertiary tabular-nums">{formatAgo(e.receivedAt, now)}</span>
      </div>
      {(e.from || e.to) && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-body-2-medium text-text-tertiary">
          {e.from && <span className="min-w-0 break-words">{streamLabel(e.from)}</span>}
          {e.from && e.to && (
            <>
              <RiArrowRightLine className="size-4 shrink-0" aria-hidden />
              <span className="sr-only">switched to</span>
            </>
          )}
          {e.to && <span className="min-w-0 break-words text-text-secondary">{streamLabel(e.to)}</span>}
          {e.from && !e.to && <span>failed</span>}
        </p>
      )}
      {e.error && <p className="text-body-2-medium text-status-rose-text">{e.error}</p>}
    </Row>
  );
}
