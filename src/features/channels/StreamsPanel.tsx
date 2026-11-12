import { RiRefreshLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import { useChannelHistory, useChannelStreams } from "@/api/queries";
import type { ChannelStreamsResponse, ChannelSummary, HistoryRange } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { Notice } from "@/components/shared/Notice";
import { QueryState } from "@/components/shared/QueryState";
import { ToneChip } from "@/components/shared/tone";
import { Button } from "@/components/ui/buttons/button";
import { useNow } from "@/hooks/useNow";
import { useWidth } from "@/hooks/useWidth";
import { healthTone } from "@/lib/tone";
import { streamStatus } from "@/lib/streamStatus";
import { SoakButton } from "@/features/soak/SoakButton";
import { ChannelHistory } from "./ChannelHistory";
import { ChannelRecheck } from "./ChannelRecheck";
import { StreamsTable } from "./StreamsTable";

const DETAIL_ERRORS: Record<NonNullable<ChannelStreamsResponse["details"]["error"]>, string> = {
  auth: "Dispatcharr refused the API key, so FPS, codec and audio are missing. Check DISPATCHARR_API_KEY.",
  unreachable: "Could not reach Dispatcharr, so FPS, codec and audio are missing for some streams.",
  timeout: "Dispatcharr was too slow to answer, so FPS, codec and audio are missing for some streams.",
};

/** One channel: its streams with Podium's measurements, loaded when the channel is opened. */
export function StreamsPanel({ channel, groupId, groupName }: { channel: ChannelSummary; groupId: number | null; groupName?: string }) {
  const query = useChannelStreams(channel.id);
  // One range for the history below and the table's Flips column (the same query, so one request).
  const [range, setRange] = useState<HistoryRange>("7d");
  const history = useChannelHistory(channel.id, range).data;
  const flips = useMemo(
    () => (history?.enabled ? new Map(history.streams.map((s) => [s.streamId, s.flips])) : undefined),
    [history],
  );
  const names = useMemo(() => new Map(query.data?.streams.map((s) => [s.id, s.name])), [query.data]);
  const healthy = query.data?.streams.filter((s) => streamStatus(s) === "alive").length;

  return (
    <Card
      title={
        <span className="flex flex-col">
          <span className="text-headline-semibold text-text-primary">{channel.name}</span>
          {groupName && <span className="text-caption-1-medium text-text-tertiary">{groupName}</span>}
        </span>
      }
      actions={
        <>
          <ChannelRecheck channelId={channel.id} groupId={groupId} name={channel.name} />
          <SoakButton target={{ scope: "channel", id: channel.id }} name={channel.name} />
          {query.data && (
            <ToneChip tone={healthTone(healthy ?? 0, query.data.streams.length)}>
              {healthy} of {query.data.streams.length} healthy
            </ToneChip>
          )}
          <Button
            variant="secondary"
            size="small"
            leadingIcon={RiRefreshLine}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </>
      }
    >
      <QueryState query={query} skeleton={<PanelSkeleton />}>
        {(data) => <PanelBody data={data} flips={flips} />}
      </QueryState>
      <ChannelHistory channelId={channel.id} range={range} onRange={setRange} names={names} />
    </Card>
  );
}

/** Below this the table keeps provider under the name and audio in one cell. */
const FULL_TABLE_MIN_PX = 1600;

function PanelBody({ data, flips }: { data: ChannelStreamsResponse; flips?: ReadonlyMap<number, number> }) {
  const now = useNow(15_000);
  const [ref, width] = useWidth<HTMLDivElement>();
  const { details, streams } = data;
  if (streams.length === 0) return <Empty>No streams are assigned to this channel.</Empty>;
  const anyMedia = streams.some((s) => s.media);

  return (
    <>
      {details.error && <Notice tone="warn">{DETAIL_ERRORS[details.error]}</Notice>}
      {!details.dispatcharr && !anyMedia && (
        <Notice tone="info">
          Podium&apos;s API reports only height and bitrate per stream. FPS, codec and audio come from the stats Podium
          writes to Dispatcharr: set DISPATCHARR_URL and DISPATCHARR_API_KEY to show them.
        </Notice>
      )}
      {details.dispatcharr && !details.error && details.missing > 0 && (
        <p className="text-body-2-medium text-text-tertiary">
          {details.missing === streams.length ? "No stream here has" : `${details.missing} of ${streams.length} streams have no`}{" "}
          FPS, codec or audio details yet: Podium has not probed them, or has not written their stats to Dispatcharr.
        </p>
      )}
      <div ref={ref} className="min-w-0">
        <StreamsTable streams={streams} now={now} wide={width >= FULL_TABLE_MIN_PX} flips={flips} />
      </div>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading streams">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-background-inner-default" />
      ))}
    </div>
  );
}
