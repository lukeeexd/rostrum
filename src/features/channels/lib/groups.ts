import type { ChannelGroup } from "@/api/types";

/** Groups whose name or channels match `query` (case-insensitive), with only the matching channels kept. */
export function filterGroups(groups: ChannelGroup[], query: string): ChannelGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.flatMap((g) => {
    if (g.name.toLowerCase().includes(q)) return [g];
    const channels = g.channels.filter((c) => c.name.toLowerCase().includes(q));
    return channels.length ? [{ ...g, channels }] : [];
  });
}

/** The group a channel belongs to, so it can be opened when the channel is selected from a link. */
export const groupOf = (groups: ChannelGroup[], channelId: number) =>
  groups.find((g) => g.channels.some((c) => c.id === channelId));
