import { useId, useState } from "react";
import { useProblems } from "@/api/queries";
import type { ProblemChannel, ProblemChannelsResponse } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { ChannelLink } from "@/components/shared/ChannelLink";
import { Paged } from "@/components/shared/Paged";
import { QueryState } from "@/components/shared/QueryState";
import { Row, RowList } from "@/components/shared/RowList";
import { SearchBox } from "@/components/shared/SearchBox";
import { ToneChip } from "@/components/shared/tone";
import { Chip } from "@/components/ui/badges/chip";
import { Button } from "@/components/ui/buttons/button";
import { useNow } from "@/hooks/useNow";
import { formatAgo, formatInt } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/streamStatus";
import { ChannelRecheck } from "@/features/channels/ChannelRecheck";
import { SoakButton } from "@/features/soak/SoakButton";
import { filterChannels, playableText, SECTIONS, UNMEASURED } from "./lib/problems";

/**
 * Every channel sorted by what is wrong with it, from Rostrum's walk of the
 * channel previews: the fixes to make in Dispatcharr (or to wait for Podium
 * on), most urgent first.
 */
export function ProblemsPage() {
  const query = useProblems();
  return <QueryState query={query}>{(data) => <ProblemsBody data={data} />}</QueryState>;
}

function ProblemsBody({ data }: { data: ProblemChannelsResponse }) {
  const now = useNow(30_000);
  const [filter, setFilter] = useState("");
  const listed = SECTIONS.reduce((n, s) => n + data.problems[s.kind].length, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="px-1 text-body-2-medium text-text-tertiary">
          {formatInt(listed)} of {formatInt(data.channels)} channels need a look, from every channel&apos;s preview, read{" "}
          {formatAgo(data.checkedAt, now)}
        </p>
        <SearchBox label="Filter channels" placeholder="Channel or group" value={filter} onChange={setFilter} />
      </div>

      <div className="grid items-start gap-4 2xl:grid-cols-2">
        {SECTIONS.map((s) => (
          <Section key={s.kind} title={s.title} hint={s.hint} all={data.problems[s.kind]} filter={filter} />
        ))}
        <Section
          title={UNMEASURED.title}
          hint={UNMEASURED.hint}
          all={data.problems.unmeasured}
          filter={filter}
          collapsible
          className="2xl:col-span-2"
        />
      </div>
    </>
  );
}

function Section({
  title,
  hint,
  all,
  filter,
  collapsible,
  className,
}: {
  title: string;
  hint: string;
  all: ProblemChannel[];
  filter: string;
  /** Folded away until asked for (with a Show/Hide button). */
  collapsible?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(!collapsible);
  const listId = useId();
  const channels = filterChannels(all, filter);
  const count = channels.length !== all.length ? `${formatInt(channels.length)} of ${formatInt(all.length)}` : formatInt(all.length);
  return (
    <Card
      className={className}
      title={`${title} · ${count}`}
      actions={
        collapsible &&
        channels.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={`${open ? "Hide" : "Show"} ${title.toLowerCase()}`}
          >
            {open ? "Hide" : "Show"}
          </Button>
        )
      }
    >
      <p className="-mt-2 text-body-2-medium text-text-tertiary">{hint}</p>
      {!collapsible && channels.length === 0 && <Empty>{all.length === 0 ? "None." : "None match this filter."}</Empty>}
      {open && channels.length > 0 && (
        <div id={listId} className="contents">
          {/* A new filter starts the list from its first page again. */}
          <Paged key={filter} items={channels}>
            {(visible) => (
              <RowList label={title}>
                {visible.map((c) => (
                  <ChannelRow key={c.id} channel={c} />
                ))}
              </RowList>
            )}
          </Paged>
        </div>
      )}
    </Card>
  );
}

function ChannelRow({ channel: c }: { channel: ProblemChannel }) {
  return (
    <Row className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <ChannelLink id={c.id} name={c.name} className="text-body-semibold text-text-primary!" />
          {c.group && <span className="text-caption-1-medium text-text-tertiary">{c.group}</span>}
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="text-caption-1-medium text-text-tertiary tabular-nums">{playableText(c)}</span>
          <ChannelRecheck channelId={c.id} groupId={c.groupId} name={c.name} />
          {c.streams > 0 && <SoakButton target={{ scope: "channel", id: c.id }} name={c.name} />}
        </span>
      </div>
      {c.first && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-2-medium text-text-tertiary">
          <span>First:</span>
          <span className="min-w-0 break-words text-text-secondary" title={c.first.name ?? undefined}>
            {c.first.name || `stream ${c.first.id}`}
            {c.first.provider && ` · ${c.first.provider}`}
          </span>
          <ToneChip tone={STATUS_TONE[c.first.status]}>{STATUS_LABEL[c.first.status]}</ToneChip>
        </p>
      )}
      {c.providers.length > 0 && (
        <ul aria-label="Providers" className="flex flex-wrap gap-1.5">
          {c.providers.map((p) => (
            <li key={p}>
              <Chip variant="caption" color="soft">
                {p}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}
