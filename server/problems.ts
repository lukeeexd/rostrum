import {
  CHARTED_PROBLEMS,
  PROBLEM_KINDS,
  type ProblemCounts,
  type ProblemChannel,
  type ProblemChannelsResponse,
  type ProblemKind,
  type ProblemStream,
} from "../src/api/types";
import type { StreamStatus } from "../src/lib/streamStatus";
import type { IndexedChannel, StreamIndex } from "./streams-index";

/**
 * Problem channels, sorted from the shared preview walk. Each channel goes in
 * the first section that fits, so none is listed twice:
 *
 *   noHealthy    some streams measured, none playable
 *   badFirst     a dead or black stream is served first though a playable one is behind it
 *   oneProvider  every stream from one provider: nothing to fall back to if it goes down
 *   empty        no streams at all
 *   unmeasured   streams, but Podium has measured none of them yet
 */

/** Playable: alive, even at a low bitrate. */
const playable = (s: StreamStatus) => s === "alive" || s === "low_bitrate";

function kindOf(c: IndexedChannel, providers: Set<string>): ProblemKind | null {
  const statuses = c.streams.map((s) => s.status);
  if (statuses.length === 0) return "empty";
  if (statuses.every((s) => s === "unprobed")) return "unmeasured";
  if (!statuses.some(playable)) return "noHealthy";
  if (statuses[0] === "dead" || statuses[0] === "black") return "badFirst";
  if (providers.size === 1) return "oneProvider";
  return null;
}

export function projectProblems(index: StreamIndex): ProblemChannelsResponse {
  const problems = Object.fromEntries(PROBLEM_KINDS.map((k) => [k, [] as ProblemChannel[]])) as Record<ProblemKind, ProblemChannel[]>;
  // Sorted once, by group then name, so every section comes out in that order.
  const channels = [...index.channels].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name));
  for (const c of channels) {
    const providers = new Set(c.streams.flatMap((s) => index.streams.get(s.streamId)?.provider ?? []));
    const kind = kindOf(c, providers);
    if (!kind) continue;
    const head = c.streams[0];
    const known = head && index.streams.get(head.streamId);
    const first: ProblemStream | null = head
      ? { id: head.streamId, name: known?.name ?? null, provider: known?.provider ?? null, status: head.status }
      : null;
    problems[kind].push({
      id: c.id,
      name: c.name,
      group: c.group,
      groupId: c.groupId,
      streams: c.streams.length,
      healthy: c.streams.filter((s) => playable(s.status)).length,
      first,
      providers: [...providers].sort((a, b) => a.localeCompare(b)),
    });
  }
  return { checkedAt: index.walkedAt, channels: index.channels.length, problems };
}

/** The counts Trends records with each snapshot. */
export function problemCounts(index: StreamIndex): ProblemCounts {
  const { problems } = projectProblems(index);
  return Object.fromEntries(CHARTED_PROBLEMS.map((k) => [k, problems[k].length])) as ProblemCounts;
}
