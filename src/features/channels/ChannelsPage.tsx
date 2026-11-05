import { RiRefreshLine } from "@remixicon/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { channelQueries, useChannelGroups } from "@/api/queries";
import type { ChannelGroupsResponse } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/buttons/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useNow } from "@/hooks/useNow";
import { formatAgo } from "@/lib/format";
import { ChannelList } from "./ChannelList";
import { groupOf } from "./lib/groups";
import { StreamsPanel } from "./StreamsPanel";

/** Matches Tailwind's 2xl breakpoint, where the page splits into list and detail. */
const WIDE = "(min-width: 1536px)";

export function ChannelsPage() {
  const groups = useChannelGroups();
  return <QueryState query={groups}>{(data) => <ChannelsBody data={data} refreshing={groups.isFetching} />}</QueryState>;
}

function ChannelsBody({ data, refreshing }: { data: ChannelGroupsResponse; refreshing: boolean }) {
  const now = useNow(30_000);
  const client = useQueryClient();
  const wide = useMediaQuery(WIDE);
  // The selected channel lives in the URL (?channel=ID), so it survives reloads and can be linked to.
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("channel")) || null;
  const group = selectedId == null ? undefined : groupOf(data.groups, selectedId);
  const channel = group?.channels.find((c) => c.id === selectedId);

  const select = (id: number | null) => setParams(id == null ? {} : { channel: String(id) }, { replace: true });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: channelQueries.groups.queryKey });
    void client.invalidateQueries({ queryKey: channelQueries.allStreams });
  };

  const panel = channel && <StreamsPanel key={channel.id} channel={channel} groupId={group?.id ?? null} groupName={group?.name} />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="px-1 text-body-2-medium text-text-tertiary">
          Dispatcharr&apos;s channels as Podium last read them
          {data.fetchedAt ? `, ${formatAgo(data.fetchedAt, now)}` : ""}
        </p>
        <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} disabled={refreshing} onClick={refresh}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Wide: the list stays put on the left while the selected channel fills the right.
          Narrow: one column, the channel's streams open under its row. */}
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <ChannelList
          groups={data.groups}
          selected={selectedId}
          onSelect={select}
          inline={wide ? undefined : (panel ?? null)}
          className="2xl:sticky 2xl:top-0 2xl:max-h-[calc(100dvh-9rem)] 2xl:overflow-y-auto"
        />
        {wide &&
          (panel ?? (
            <Card>
              <Empty>Pick a channel to see its streams and what Podium measured for each.</Empty>
            </Card>
          ))}
      </div>
    </>
  );
}
