import { useState } from "react";
import { useSearchParams } from "react-router";
import { isSearchable, useChannelGroups, useStreamSearch } from "@/api/queries";
import type { StreamSearchResponse } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { ChannelLink } from "@/components/shared/ChannelLink";
import { QueryState } from "@/components/shared/QueryState";
import { SearchBox } from "@/components/shared/SearchBox";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { Chip } from "@/components/ui/badges/chip";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { useDebounced } from "@/hooks/useDebounced";
import { formatInt } from "@/lib/format";
import { channelNames, filterResults, type SearchFilter } from "./lib/search";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unclaimed", label: "On no channel" },
] as const;

/**
 * Searches every stream in the catalogue by name, grouped the way Podium
 * matches them, and shows which channel (if any) claims each name. Handy for
 * finding a feed no channel picks up yet.
 */
export function StreamsPage() {
  // The search lives in the URL (?q=…), so it can be linked to and survives a reload.
  const [params, setParams] = useSearchParams();
  const [query, setQueryState] = useState(() => params.get("q") ?? "");
  const setQuery = (q: string) => {
    setQueryState(q);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q.trim()) next.set("q", q);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  };
  const [filter, setFilter] = useState<SearchFilter>("all");
  const settled = useDebounced(query);
  const search = useStreamSearch(settled);
  const ready = isSearchable(settled);

  return (
    <Card
      title="Search the catalogue"
      actions={
        <>
          <SearchBox label="Search streams" placeholder="Stream name, e.g. Arena Sports" value={query} onChange={setQuery} inputClassName="w-64" />
          <SegmentedControl<SearchFilter> label="Show" value={filter} onChange={setFilter} options={FILTERS} />
        </>
      }
    >
      {!ready ? (
        <Empty>Type at least two characters to search every stream Dispatcharr has, across all providers.</Empty>
      ) : (
        <QueryState query={search} skeleton={<div className="h-40 animate-pulse rounded-2lg bg-background-inner-default" />}>
          {(data) => <Results data={data} filter={filter} />}
        </QueryState>
      )}
    </Card>
  );
}

function Results({ data, filter }: { data: StreamSearchResponse; filter: SearchFilter }) {
  const groups = useChannelGroups();
  const names = channelNames(groups.data?.groups);
  const results = filterResults(data.results, filter);
  const claimed = data.results.filter((r) => r.channelIds.length > 0).length;

  return (
    <>
      <p className="text-body-2-medium text-text-tertiary">
        {formatInt(data.total)} {data.total === 1 ? "name" : "names"} match &ldquo;{data.query}&rdquo;
        {data.truncated && `, showing the first ${formatInt(data.results.length)}`} · {formatInt(claimed)} on a channel
      </p>
      {results.length === 0 ? (
        <Empty>{filter === "unclaimed" ? "Every match is already on a channel." : "No stream matches."}</Empty>
      ) : (
        <Table aria-label="Matching streams" size="sm">
          <TableHeader>
            <TableColumn isRowHeader className="w-72">Name</TableColumn>
            <TableColumn className="num w-20">Streams</TableColumn>
            <TableColumn className="w-80 ps-6!">Providers</TableColumn>
            <TableColumn className="w-64">Channel</TableColumn>
            <TableColumn>Examples</TableColumn>
          </TableHeader>
          <TableBody items={results.map((r, i) => ({ ...r, id: `${i}-${r.name}` }))}>
            {(r) => (
              <TableRow>
                <TableCell>
                  <span className="text-text-primary">{r.name}</span>
                </TableCell>
                <TableCell className="num">{formatInt(r.count)}</TableCell>
                <TableCell className="ps-6!">
                  <span className="flex flex-wrap gap-1">
                    {r.providers.map((p) => (
                      <Chip key={p} variant="caption" color="soft">
                        {p}
                      </Chip>
                    ))}
                  </span>
                </TableCell>
                <TableCell>
                  {r.channelIds.length === 0 ? (
                    <span className="text-text-tertiary">on no channel</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.channelIds.map((id) => (
                        <ChannelLink key={id} id={id}>
                          <Chip variant="caption" color="blue">
                            {names.get(id) ?? `Channel ${id}`}
                          </Chip>
                        </ChannelLink>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="block truncate text-text-secondary" title={r.samples.join("\n")}>
                    {r.samples.join(" · ")}
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </>
  );
}
