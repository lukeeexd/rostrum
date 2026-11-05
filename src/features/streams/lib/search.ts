import type { ChannelGroup, StreamSearchResult } from "@/api/types";

export type SearchFilter = "all" | "unclaimed";

/** Results a filter keeps: everything, or only names no channel claims. */
export const filterResults = (results: StreamSearchResult[], filter: SearchFilter) =>
  filter === "unclaimed" ? results.filter((r) => r.channelIds.length === 0) : results;

/** Channel id → name, for showing which channel claims a result. */
export function channelNames(groups: ChannelGroup[] | undefined): Map<number, string> {
  const names = new Map<number, string>();
  for (const g of groups ?? []) for (const c of g.channels) names.set(c.id, c.name);
  return names;
}
