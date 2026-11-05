import { describe, expect, it } from "vitest";
import type { StreamStatus } from "../src/lib/streamStatus";
import { projectProblems } from "./problems";
import type { IndexedChannel, IndexedStream, StreamIndex } from "./streams-index";

let nextId = 1;
const providerOf = new Map<number, string>();

/** A channel whose streams are given as [status, provider] in Dispatcharr's order. */
function channel(name: string, streams: [StreamStatus, string][], group = "Sport"): IndexedChannel {
  return {
    id: nextId++,
    name,
    group,
    groupId: 1,
    streams: streams.map(([status, provider]) => {
      const streamId = nextId++;
      providerOf.set(streamId, provider);
      return { streamId, status };
    }),
  };
}

function index(channels: IndexedChannel[]): StreamIndex {
  const streams = new Map<number, IndexedStream>();
  for (const c of channels) {
    for (const s of c.streams) {
      streams.set(s.streamId, {
        streamId: s.streamId,
        name: `stream ${s.streamId}`,
        provider: providerOf.get(s.streamId)!,
        channelId: c.id,
        channelName: c.name,
        lastSoak: null,
      });
    }
  }
  return { walkedAt: 42, source: "previews", streams, channels, channelsByName: new Map() };
}

describe("projectProblems", () => {
  const channels = [
    channel("All dead", [["dead", "A"], ["black", "B"]]),
    channel("Bad first", [["dead", "A"], ["alive", "B"]]),
    channel("Black first", [["black", "A"], ["low_bitrate", "B"]], "News"),
    channel("One provider", [["alive", "A"], ["alive", "A"]]),
    channel("Empty", []),
    channel("Never measured", [["unprobed", "A"], ["unprobed", "B"]]),
    channel("Fine", [["alive", "A"], ["dead", "B"]]),
    channel("Low but playable", [["low_bitrate", "A"], ["dead", "B"]]),
  ];
  const out = projectProblems(index(channels));
  const names = (k: keyof typeof out.problems) => out.problems[k].map((c) => c.name);

  it("puts each channel in the first section that fits, and leaves healthy ones out", () => {
    expect(names("noHealthy")).toEqual(["All dead"]);
    expect(names("badFirst")).toEqual(["Black first", "Bad first"]); // by group, then name
    expect(names("oneProvider")).toEqual(["One provider"]);
    expect(names("empty")).toEqual(["Empty"]);
    expect(names("unmeasured")).toEqual(["Never measured"]);
    expect(out.channels).toBe(channels.length);
    expect(out.checkedAt).toBe(42);
  });

  it("describes each channel: playable count, what is served first, providers", () => {
    const [badFirst] = out.problems.badFirst.filter((c) => c.name === "Bad first");
    expect(badFirst).toMatchObject({ group: "Sport", streams: 2, healthy: 1, providers: ["A", "B"] });
    expect(badFirst.first).toMatchObject({ status: "dead", provider: "A" });
    expect(out.problems.empty[0]).toMatchObject({ streams: 0, healthy: 0, first: null, providers: [] });
  });
});

describe("problemCounts", () => {
  it("counts the four charted sections, not the unmeasured one", async () => {
    const { problemCounts } = await import("./problems");
    const idx = index([channel("Dead", [["dead", "A"]]), channel("Unmeasured", [["unprobed", "A"]]), channel("Empty", [])]);
    expect(problemCounts(idx)).toEqual({ noHealthy: 1, badFirst: 0, oneProvider: 0, empty: 1 });
  });
});
