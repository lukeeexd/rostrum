import { RiArrowUpDownLine, RiPulseLine, RiRadarLine } from "@remixicon/react";
import { useState } from "react";
import { useFlaky } from "@/api/queries";
import type { FlakyProvider, FlakyResponse, FlakyStream, HistoryRange } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { ChannelLink } from "@/components/shared/ChannelLink";
import { Notice } from "@/components/shared/Notice";
import { Paged } from "@/components/shared/Paged";
import { QueryState } from "@/components/shared/QueryState";
import { Row, RowList } from "@/components/shared/RowList";
import { SearchBox } from "@/components/shared/SearchBox";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { StatGrid, StatTile } from "@/components/shared/StatTile";
import { ToneChip } from "@/components/shared/tone";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt, formatPercent, orUnnamed } from "@/lib/format";
import { HISTORY_RANGES, rangeLabel } from "@/lib/ranges";
import { FLAKY_FLIPS } from "@/lib/flips";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/streamStatus";
import { filterFlaky, flakySummary, shareTone } from "./lib/flaky";

/**
 * Streams that keep coming and going. Podium keeps only each stream's latest
 * verdict, so Rostrum logs every probe it sees (and, on Podium 1.18+, reads
 * Podium's own probe history) and ranks streams by how often they went from
 * playable to broken or back between one probe and the next.
 */
export function FlakyPage() {
  const [range, setRange] = useState<HistoryRange>("30d");
  const flaky = useFlaky(range);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<HistoryRange> label="Range" value={range} onChange={setRange} options={HISTORY_RANGES} />
        {flaky.data?.enabled && <Logging data={flaky.data} />}
      </div>
      <QueryState query={flaky}>{(data) => <FlakyBody data={data} />}</QueryState>
    </>
  );
}

function Logging({ data }: { data: FlakyResponse }) {
  const now = useNow(60_000);
  const since = data.since != null && `; the oldest logged ran ${formatAgo(data.since, now)}`;
  return (
    <p className="px-1 text-body-2-medium text-text-tertiary">
      {data.podiumHistory ? "Podium's probe history, read every 5 minutes" : "Every probe Rostrum sees, checked every 5 minutes"}
      {since}. Kept for 90 days
    </p>
  );
}

function FlakyBody({ data }: { data: FlakyResponse }) {
  if (!data.enabled) {
    return (
      <Notice tone="info">
        {data.reason} The probe log is kept in the same database as Trends. With Docker, the compose file in this repo sets{" "}
        <code>HISTORY_DB=/data/rostrum.db</code> on a <code>rostrum-data</code> volume for you.
      </Notice>
    );
  }
  if (data.probed === 0) {
    return (
      <Card>
        <Empty>
          No probes logged in the last {rangeLabel(data.range)}
          {data.since == null ? ", or Rostrum has not checked yet (it does within a few seconds of starting)" : ""}. Podium
          probes a healthy stream about once a day, so flips take a few days to show.
        </Empty>
      </Card>
    );
  }
  return (
    <>
      {!data.podiumHistory && (
        <Notice tone="info">
          This Podium has no probe history, so the log starts when Rostrum started and misses probes while it was not
          running. Podium 1.18 and later keep 30 days of it, which Rostrum reads back.
        </Notice>
      )}
      <StatGrid>
        <StatTile icon={RiRadarLine} label="Streams probed" value={formatInt(data.probed)} caption={`in the last ${rangeLabel(data.range)}`} />
        <StatTile
          icon={RiArrowUpDownLine}
          label="Flipped"
          value={formatInt(data.flipping)}
          tone={data.flipping ? "warn" : "good"}
          caption="went broken or came back at least once"
        />
        <StatTile
          icon={RiPulseLine}
          label="Flaky"
          value={formatPercent(data.flaky, data.probed)}
          tone={data.flaky ? "bad" : "good"}
          caption={`${formatInt(data.flaky)} flipped ${FLAKY_FLIPS} or more times`}
        />
      </StatGrid>
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StreamsCard key={data.range} streams={data.streams} total={data.flipping} />
        <ProvidersCard providers={data.providers} />
      </div>
    </>
  );
}

function StreamsCard({ streams, total }: { streams: FlakyStream[]; total: number }) {
  const now = useNow(60_000);
  const [filter, setFilter] = useState("");
  const shown = filterFlaky(streams, filter);
  const count = shown.length !== streams.length ? `${formatInt(shown.length)} of ${formatInt(streams.length)}` : formatInt(total);
  return (
    <Card
      title={`Streams that flipped · ${count}`}
      actions={streams.length > 0 && <SearchBox label="Filter streams" placeholder="Stream, provider or channel" value={filter} onChange={setFilter} />}
    >
      <p className="-mt-2 text-body-2-medium text-text-tertiary">
        Most flips first: each time a stream went from playable (alive, low bitrate) to broken (dead, black) or back.
        {streams.length < total && ` The ${formatInt(streams.length)} worst are listed.`}
      </p>
      {shown.length === 0 ? (
        <Empty>{streams.length === 0 ? "No stream flipped in this range." : "None match this filter."}</Empty>
      ) : (
        <Paged key={filter} items={shown}>
          {(visible) => (
            <RowList label="Streams that flipped">
              {visible.map((s) => (
                <Row key={s.streamId} roomy className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-body-semibold text-text-primary" title={s.name ?? undefined}>
                      {s.name || `Stream ${s.streamId}`}
                    </span>
                    <ToneChip tone={STATUS_TONE[s.status]}>now {STATUS_LABEL[s.status]}</ToneChip>
                  </div>
                  <p className="text-body-2-medium text-text-tertiary">
                    {flakySummary(s)} · {orUnnamed(s.provider)}
                    {s.channelId != null && (
                      <>
                        {" · "}
                        <ChannelLink id={s.channelId} name={s.channelName} />
                      </>
                    )}
                    {s.lastFlipAt != null && ` · last flipped ${formatAgo(s.lastFlipAt, now)}`}
                  </p>
                </Row>
              ))}
            </RowList>
          )}
        </Paged>
      )}
    </Card>
  );
}

function ProvidersCard({ providers }: { providers: FlakyProvider[] }) {
  return (
    <Card title="By provider">
      {providers.length === 0 ? (
        <Empty>No provider names logged yet.</Empty>
      ) : (
        <RowList label="Flaky streams by provider">
          {providers.map((p) => (
            <Row key={p.name} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-semibold text-text-primary">{p.name}</span>
              <span className="flex items-center gap-2 text-caption-1-medium text-text-tertiary tabular-nums">
                {formatInt(p.flaky)} of {formatInt(p.probed)}
                <ToneChip tone={shareTone(p) ?? "neutral"}>{formatPercent(p.flaky, p.probed)} flaky</ToneChip>
              </span>
            </Row>
          ))}
        </RowList>
      )}
      <p className="text-caption-1-medium text-text-tertiary">Flaky: flipped {FLAKY_FLIPS} or more times in this range.</p>
    </Card>
  );
}
