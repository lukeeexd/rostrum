import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { StreamStatus } from "../src/lib/streamStatus";
import { openHeadsTable, SEEN_FOR_MS, summariseHeads } from "./channel-heads";
import { createHistory } from "./history";
import type { StreamIndex } from "./streams-index";

const TICK = SEEN_FOR_MS;

/** A walk at `walkedAt` where channel 1 serves `first` (stream id, status), or nothing. */
function walk(first: [number, StreamStatus] | null, walkedAt = 0): StreamIndex {
  const streams = new Map(first ? [[first[0], { streamId: first[0], name: `S${first[0]}`, provider: "Provider A", channelId: 1, channelName: "C", lastSoak: null }]] : []);
  return {
    walkedAt,
    source: "previews",
    streams,
    channels: [{ id: 1, name: "C", group: "G", groupId: 1, streams: first ? [{ streamId: first[0], status: first[1] }] : [] }],
    channelsByName: new Map(),
  };
}

/** A table, and an `add` that records a walk taken at a given time. */
function table() {
  const heads = openHeadsTable(new DatabaseSync(":memory:"));
  return { heads, add: (t: number, first: [number, StreamStatus] | null) => heads.add(walk(first, t)) };
}

describe("openHeadsTable", () => {
  it("writes a row only when slot 1 changes stream or state, and stamps it as seen otherwise", () => {
    const { heads, add } = table();
    expect(add(0, [10, "alive"])).toBe(1);
    expect(add(TICK, [10, "alive"])).toBe(0);
    expect(add(2 * TICK, [10, "dead"])).toBe(1);
    expect(add(3 * TICK, [20, "alive"])).toBe(1);
    expect(add(4 * TICK, null)).toBe(1);
    const rows = heads.between(1, 0, 10 * TICK);
    expect(rows.map((r) => [r.since, r.last_seen, r.stream_id, r.status])).toEqual([
      [0, TICK, 10, "alive"],
      [2 * TICK, 2 * TICK, 10, "dead"],
      [3 * TICK, 3 * TICK, 20, "alive"],
      [4 * TICK, 4 * TICK, null, "empty"],
    ]);
    expect(heads.since(1)).toBe(0);
  });

  it("keeps the row in force when a window opens, and prunes the ones before it", () => {
    const { heads, add } = table();
    add(0, [10, "alive"]);
    add(TICK, [20, "alive"]);
    add(10 * TICK, [20, "alive"]);
    expect(heads.between(1, 5 * TICK, 10 * TICK).map((r) => r.stream_id)).toEqual([20]);
    expect(heads.pruneBefore(5 * TICK)).toBe(1);
    expect(heads.between(1, 0, 10 * TICK).map((r) => r.stream_id)).toEqual([20]);
  });

  it("drops a channel entirely once it has not been seen since the cutoff", () => {
    const { heads, add } = table();
    add(0, [10, "alive"]);
    add(TICK, [10, "alive"]);
    expect(heads.pruneBefore(5 * TICK)).toBe(1);
    expect(heads.since(1)).toBeNull();
  });
});

describe("summariseHeads", () => {
  const row = (since: number, lastSeen: number, streamId: number | null, status: string) => ({
    channel_id: 1,
    since,
    last_seen: lastSeen,
    stream_id: streamId,
    name: streamId ? `S${streamId}` : null,
    provider: streamId ? "Provider A" : null,
    status: status as StreamStatus,
  });

  it("builds segments, leaves a gap where Rostrum was not running, and works out the playable share", () => {
    const rows = [row(0, 3 * TICK, 10, "alive"), row(4 * TICK, 4 * TICK, 10, "dead"), row(20 * TICK, 23 * TICK, 20, "alive")];
    const out = summariseHeads(rows, 0, 30 * TICK);
    expect(out.segments.map((s) => [s.from / TICK, s.to / TICK, s.status])).toEqual([
      [0, 4, "alive"],
      [4, 5, "dead"], // last seen at 4, so it lasts one tick, then a gap until 20
      [20, 24, "alive"],
    ]);
    expect(out.playableShare).toBeCloseTo(8 / 9);
    expect(out.changes.map((c) => [c.at / TICK, c.from.status, c.to.streamId])).toEqual([
      [20, "dead", 20],
      [4, "alive", 10],
    ]);
  });

  it("clips the row in force at the window's start, and lists only changes inside the window", () => {
    const out = summariseHeads([row(0, 100 * TICK, 10, "alive"), row(100 * TICK, 101 * TICK, 20, "black")], 50 * TICK, 101 * TICK);
    expect(out.segments[0]).toMatchObject({ from: 50 * TICK, to: 100 * TICK, streamId: 10 });
    expect(out.changes).toHaveLength(1);
    expect(out.playableShare).toBeCloseTo(50 / 51);
  });

  it("has no share with nothing recorded", () => {
    expect(summariseHeads([], 0, 10)).toEqual({ segments: [], playableShare: null, changes: [] });
  });
});

describe("createHistory channel history", () => {
  it("logs slot 1 on each tick and serves one channel, with its soaks and Connect events", async () => {
    let t = Date.now() - 60 * 60_000;
    const happened = t; // Podium reports the same soak and the same delivery on every tick
    const h = createHistory({
      file: ":memory:",
      stats: async () => ({}),
      providers: async () => ({ providers: [] }),
      soaks: async () => [
        { streamId: 10, completedAt: happened, name: "S10", provider: "Provider A", channelId: 99, channelName: "Other", heldMs: 1, drops: 0, failedDials: 0, unreachable: false, verdict: "clean" },
      ],
      connectEvents: async () => [
        { id: 1, event: "stream_switch", reason: "health_monitor", receivedAt: happened, accepted: true, error: null, channelName: "C", channelId: null, from: null, to: null },
      ],
      walk: async () => walk([10, "alive"], t),
      now: () => t,
    });
    await h.sample();
    t += TICK;
    await h.sample();
    const res = h.readChannel(1, "24h", { streamIds: [10], name: "C" });
    expect(res).toMatchObject({ enabled: true, playableShare: 1, changes: [] });
    expect(res.segments).toHaveLength(1);
    expect(res.soaks.map((s) => s.streamId)).toEqual([10]); // logged against another channel, but the stream is on this one
    expect(res.connect).toHaveLength(1); // matched by name, since it was logged unlinked
    expect(h.readChannel(2, "24h").segments).toEqual([]);
    h.close();
  });
});
