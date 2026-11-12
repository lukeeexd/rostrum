import { describe, expect, it } from "vitest";
import type { StreamStatus } from "../src/lib/streamStatus";
import { FLAKY_FLIPS } from "../src/lib/flips";
import { channelProbes, projectFlaky, summariseProbes } from "./flaky";
import type { ProbeRow } from "./stream-probes";
import type { IndexedStream, StreamIndex } from "./streams-index";

const H = 3600_000;
const row = (stream_id: number, probed_at: number, status: StreamStatus, provider: string | null = "Provider A"): ProbeRow => ({
  stream_id,
  probed_at,
  status,
  name: `logged ${stream_id}`,
  provider,
});

describe("summariseProbes", () => {
  it("counts only playable ↔ broken changes inside the range, from the probe in force when it opens", () => {
    const rows = [
      row(1, 0, "dead"), // in force when the range opens at 10h: not a flip into the range
      row(1, 12 * H, "low_bitrate"), // broken → playable: flip
      row(1, 14 * H, "alive"), // still playable: not a flip
      row(1, 16 * H, "black"), // playable → broken: flip
      row(1, 18 * H, "dead"), // still broken
    ];
    const s = summariseProbes(1, rows, 10 * H, 20 * H);
    expect(s.history).toMatchObject({ probes: 4, flips: 2 });
    expect(s.lastFlipAt).toBe(16 * H);
    expect(s.history.segments).toEqual([
      { from: 10 * H, to: 12 * H, status: "dead" },
      { from: 12 * H, to: 14 * H, status: "low_bitrate" },
      { from: 14 * H, to: 16 * H, status: "alive" },
      { from: 16 * H, to: 18 * H, status: "black" },
      { from: 18 * H, to: 20 * H, status: "dead" },
    ]);
    // Broken 10–12h and 16–20h: 6 of 10 hours, however many probes each stretch had.
    expect(s.brokenShare).toBeCloseTo(0.6);
  });

  it("has no share and no flips for a stream with nothing logged", () => {
    expect(summariseProbes(9, [], 0, H)).toEqual({
      history: { streamId: 9, probes: 0, flips: 0, segments: [] },
      brokenShare: null,
      lastFlipAt: null,
    });
  });
});

describe("projectFlaky", () => {
  const index = {
    streams: new Map<number, Partial<IndexedStream>>([[1, { name: "Arena 1 HD", provider: "Provider B", channelId: 40, channelName: "Arena 1" }]]),
  } as unknown as StreamIndex;
  const rows = [
    ...[0, 1, 2, 3].map((i) => row(1, i * H, i % 2 ? "dead" : "alive")), // 3 flips
    ...[0, 1].map((i) => row(2, i * H, i % 2 ? "dead" : "alive")), // 1 flip
    row(3, H, "alive"),
    row(3, 2 * H, "alive"), // steady
    row(4, 0, "dead", null), // only the in-force probe before the range: not probed in it
  ];

  it("lists streams that flipped, worst first, named from the index or else the log", () => {
    const out = projectFlaky(rows, H / 2, 4 * H, index);
    expect(out.streams.map((s) => [s.streamId, s.flips, s.name, s.channelId])).toEqual([
      [1, 3, "Arena 1 HD", 40],
      [2, 1, "logged 2", null],
    ]);
    expect(out.streams[0]).toMatchObject({ provider: "Provider B", status: "dead", probes: 3 });
    expect(out).toMatchObject({ flipping: 2, flaky: 1, probed: 3 });
  });

  it(`gives each provider the share of its probed streams that flipped ${FLAKY_FLIPS}+ times`, () => {
    expect(projectFlaky(rows, H / 2, 4 * H, index).providers).toEqual([
      { name: "Provider A", probed: 2, flaky: 0, share: 0 },
      { name: "Provider B", probed: 1, flaky: 1, share: 1 },
    ]);
  });
});

describe("channelProbes", () => {
  it("gives every stream on the channel in its order, logged or not", () => {
    const out = channelProbes([row(5, 0, "alive"), row(5, H, "dead"), row(7, 0, "alive")], [7, 6, 5], 0, 2 * H);
    expect(out.map((s) => [s.streamId, s.probes, s.flips, s.segments.length])).toEqual([
      [7, 1, 0, 1],
      [6, 0, 0, 0],
      [5, 2, 1, 2],
    ]);
  });
});
