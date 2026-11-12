import { describe, expect, it, vi } from "vitest";
import type { PodiumClient, PodiumProbeHistory } from "./podium";
import { createProbeFeed, OVERLAP_MS, probesFromIndex } from "./probe-feed";
import { ROUTE_RECHECK_MS } from "./route-support";
import type { IndexedStream, StreamIndex } from "./streams-index";
import { UpstreamError } from "./upstream";

/** An index of `n` streams (ids 1..n); stream 1 last probed alive at 5, the rest never. */
function index(n = 3): StreamIndex {
  const streams = new Map<number, IndexedStream>();
  for (let id = 1; id <= n; id++) {
    streams.set(id, {
      streamId: id,
      name: `S${id}`,
      provider: "Provider A",
      channelId: 1,
      channelName: "C",
      lastSoak: null,
      probedAt: id === 1 ? 5 : null,
      status: id === 1 ? "alive" : "unprobed",
    });
  }
  return { walkedAt: 0, source: "verdicts", streams, channels: [], channelsByName: new Map() };
}

const history = (fetchedAt: number, streams: PodiumProbeHistory["streams"] = []): PodiumProbeHistory => ({ fetchedAt, cacheUnavailable: false, streams });

function podium(probeHistory: PodiumClient["probeHistory"], version = "1.18.0") {
  return { probeHistory: vi.fn(probeHistory), health: vi.fn(async () => ({ version })) } as unknown as PodiumClient & {
    probeHistory: ReturnType<typeof vi.fn>;
    health: ReturnType<typeof vi.fn>;
  };
}

describe("probesFromIndex", () => {
  it("logs each probed stream's latest probe, skipping unprobed ones", () => {
    expect(probesFromIndex(index())).toEqual([{ streamId: 1, probedAt: 5, status: "alive", name: "S1", provider: "Provider A" }]);
  });
});

/** One tick, saved: the batch's probes, after which the feed remembers what it read. */
async function tick(feed: ReturnType<typeof createProbeFeed>) {
  const batch = await feed.probes();
  batch.commit();
  return batch.probes;
}

describe("createProbeFeed", () => {
  it("back-fills in batches of 500 streams, then asks only for what is new, overlapping a little", async () => {
    const p = podium(async () =>
      history(1_000_000, [{ id: 2, probes: [{ probedAt: 900, alive: false }, { probedAt: 800, alive: true, black: false, lowBitrate: true }] }]),
    );
    const feed = createProbeFeed(p, async () => index(501), { log: () => {} });
    const first = await tick(feed);
    expect(p.probeHistory.mock.calls.map(([q]) => q.streams?.length)).toEqual([500, 1]);
    expect(first).toContainEqual({ streamId: 2, probedAt: 900, status: "dead", name: "S2", provider: "Provider A" });
    expect(first).toContainEqual({ streamId: 2, probedAt: 800, status: "low_bitrate", name: "S2", provider: "Provider A" });
    expect(feed.podiumHistory).toBe(true);

    await tick(feed);
    expect(p.probeHistory.mock.calls[2][0]).toEqual({ since: 1_000_000 - OVERLAP_MS });
  });

  it("reads back streams that appear later, and waits for streams before the first read", async () => {
    const p = podium(async () => history(100));
    let n = 0;
    const feed = createProbeFeed(p, async () => index(n), { log: () => {} });
    await tick(feed);
    expect(p.probeHistory).not.toHaveBeenCalled(); // nothing to read back, and no `since` read before one has been
    n = 2;
    await tick(feed);
    n = 3;
    await tick(feed);
    expect(p.probeHistory.mock.calls.map(([q]) => q)).toEqual([{ streams: [1, 2] }, { streams: [3] }, { since: 100 - OVERLAP_MS }]);
  });

  it("reads the same again when a batch was not saved", async () => {
    const p = podium(async () => history(100));
    const feed = createProbeFeed(p, async () => index(), { log: () => {} });
    await feed.probes(); // never committed: the save failed
    await tick(feed);
    expect(p.probeHistory.mock.calls.map(([q]) => q)).toEqual([{ streams: [1, 2, 3] }, { streams: [1, 2, 3] }]);
  });

  it("says when a stream had more probes than Podium returns at once", async () => {
    const log = vi.fn();
    const probes = Array.from({ length: 100 }, (_, i) => ({ probedAt: 1000 - i, alive: true }));
    const feed = createProbeFeed(podium(async () => history(5, [{ id: 1, probes }])), async () => index(), { log });
    await tick(feed);
    expect(log.mock.calls.some(([m]) => /1 streams had more probes/.test(m))).toBe(true);
  });

  it("logs only the index's probes on a Podium without it, and does not ask again until the recheck", async () => {
    let t = 0;
    const p = podium(async () => {
      throw new UpstreamError("status", 404);
    }, "1.17.0");
    const feed = createProbeFeed(p, async () => index(), { now: () => t, log: () => {} });
    expect(await tick(feed)).toHaveLength(1);
    expect(feed.podiumHistory).toBe(false);
    await tick(feed);
    expect(p.probeHistory).toHaveBeenCalledOnce();
    t += ROUTE_RECHECK_MS;
    await tick(feed);
    expect(p.probeHistory).toHaveBeenCalledTimes(2);
  });

  it("treats an answer that is not probe history as not supported", async () => {
    const p = podium(async () => ({ currentOrder: [] }) as never);
    const feed = createProbeFeed(p, async () => index(), { log: () => {} });
    await tick(feed);
    await tick(feed);
    expect(p.probeHistory).toHaveBeenCalledOnce();
  });

  it("on a failure, says so once, keeps the index's probes, and retries the same read next tick", async () => {
    const log = vi.fn();
    const p = podium(async () => history(50));
    p.probeHistory.mockRejectedValueOnce(new UpstreamError("timeout")).mockRejectedValueOnce(new UpstreamError("timeout"));
    const feed = createProbeFeed(p, async () => index(), { log });
    expect(await tick(feed)).toHaveLength(1);
    await tick(feed);
    expect(log.mock.calls.filter(([m]) => /probe-history failed/.test(m))).toHaveLength(1);
    await tick(feed);
    // Still the back-fill (by stream), not a `since` read: nothing was read yet.
    expect(p.probeHistory.mock.calls.map(([q]) => Object.keys(q))).toEqual([["streams"], ["streams"], ["streams"]]);
    expect(feed.podiumHistory).toBe(true);
  });

  it("does not move on when Podium could not read its store", async () => {
    const p = podium(async () => ({ ...history(70), cacheUnavailable: true }));
    const feed = createProbeFeed(p, async () => index(), { log: () => {} });
    await tick(feed);
    await tick(feed);
    expect(p.probeHistory.mock.calls.every(([q]) => "streams" in q)).toBe(true);
    expect(feed.podiumHistory).toBe(false);
  });
});
