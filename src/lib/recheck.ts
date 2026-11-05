import type { RefreshMarks } from "../api/types";

/** The re-check already covering a channel or group, widest first: the whole catalogue, its group, or the channel itself. */
export function recheckCovering(
  marks: RefreshMarks,
  { groupId, channelId }: { groupId: number | null; channelId?: number },
): { by: "all" | "group" | "channel"; at: number } | null {
  if (marks.all != null) return { by: "all", at: marks.all };
  const group = groupId == null ? undefined : marks.groups[String(groupId)];
  if (group != null) return { by: "group", at: group };
  const channel = channelId == null ? undefined : marks.channels?.[String(channelId)];
  return channel != null ? { by: "channel", at: channel } : null;
}
