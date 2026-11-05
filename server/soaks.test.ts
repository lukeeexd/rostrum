import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { SoakRecord } from "../src/api/types";
import { createHistory } from "./history";
import type { PodiumClient, PodiumPreview, PodiumState } from "./podium";
import { soakVerdict } from "../src/lib/soak";
import { summariseSoaks } from "./soak-summary";
import { collectSoaks, openSoakTable } from "./soaks";
import { createStreamIndex, walkPreviews } from "./streams-index";
import { UpstreamError } from "./upstream";

const SECRET = "http://user:SECRET123@cdn.example/live/user/SECRET123/1.ts";

const state: PodiumState = {
  fetchedAt: 1,
  groups: [
    { id: 1, name: "Sport", rows: [{ id: 10, name: "Arena Sports" }, { id: 11, name: "Gone" }] },
    { id: 2, name: "News", rows: [{ id: 12, name: "Northgate News" }, { id: -1, name: "bad id" }] },
  ],
};

const soak = (over: Partial<NonNullable<PodiumPreview["currentOrder"]>[number]["lastSoak"]> = {}) => ({
  completedAt: 1000,
  heldMs: 180_000,
  drops: 0,
  failedDials: 0,
  unreachable: false,
  ...over,
});

const previews: Record<number, PodiumPreview> = {
  10: {
    currentOrder: [
      { id: 1, raw: `Arena Sports 1 ${SECRET}`, provider: "Provider A", lastSoak: soak() },
      { id: 2, raw: "Arena Sports 1 B", provider: "Provider C", lastSoak: null },
      { id: 3, raw: "Arena Sports 1 C", provider: "Provider A", lastSoak: soak({ drops: 2, heldMs: 112_000 }) },
    ],
  },
  12: {
    currentOrder: [
      { id: 1, raw: "Arena Sports 1", provider: "Provider A", lastSoak: soak() },
      { id: 4, raw: "Northgate News", provider: "Provider B", lastSoak: soak({ unreachable: true, failedDials: 3, heldMs: 1000 }) },
      { id: 5, raw: "No time", provider: "Provider B", lastSoak: { heldMs: 5 } },
    ],
  },
};

type MockPodium = PodiumClient & { preview: ReturnType<typeof vi.fn>; state: ReturnType<typeof vi.fn> };

function podium(): MockPodium {
  return {
    state: vi.fn(async () => state),
    preview: vi.fn(async (channelId: number) => {
      if (channelId === 11) throw new UpstreamError("status", 404);
      return previews[channelId];
    }),
    searchStreams: vi.fn(),
    metrics: vi.fn(),
    stats: vi.fn(),
    // Podium 1.17: no /api/verdicts, so the index walks the previews.
    health: vi.fn(async () => ({ version: "1.17.0" })),
    verdicts: vi.fn(async () => {
      throw new UpstreamError("status", 404);
    }),
  } as unknown as MockPodium;
}

const record = (over: Partial<SoakRecord> = {}): SoakRecord => {
  const r = {
    streamId: 1,
    completedAt: 1000,
    name: "S",
    provider: "P",
    channelId: 10,
    channelName: "C",
    heldMs: 180_000,
    drops: 0,
    failedDials: 0,
    unreachable: false,
    ...over,
  };
  return { ...r, verdict: soakVerdict(r) };
};

describe("walkPreviews and collectSoaks", () => {
  it("walks every channel's preview and keeps one result per soaked stream", async () => {
    const p = podium();
    const out = collectSoaks(await walkPreviews(p));
    expect(p.preview.mock.calls.map(([id]) => id).sort()).toEqual([10, 11, 12]);
    expect(out.map((r) => [r.streamId, r.channelName, r.verdict])).toEqual([
      [1, "Arena Sports", "clean"],
      [3, "Arena Sports", "dropped"],
      [4, "Northgate News", "unreachable"],
    ]);
  });

  it("redacts stream names", async () => {
    const [first] = collectSoaks(await walkPreviews(podium()));
    expect(first.name).not.toContain("SECRET123");
    expect(first.name).toContain("cdn.example");
  });

  it("fails the walk on anything but a vanished channel", async () => {
    const p = podium();
    p.preview.mockRejectedValueOnce(new UpstreamError("timeout"));
    await expect(walkPreviews(p)).rejects.toThrow();
  });

  it("indexes every stream, soaked or not, and the channels by name", async () => {
    const index = await walkPreviews(podium());
    expect([...index.streams.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(index.streams.get(2)).toMatchObject({ name: "Arena Sports 1 B", provider: "Provider C", channelId: 10, lastSoak: null });
    expect(Object.fromEntries(index.channelsByName)).toEqual({ "Arena Sports": 10, Gone: 11, "Northgate News": 12 });
  });

  it("keeps each channel's group and its streams in Dispatcharr's order, with a status", async () => {
    const p = podium();
    p.preview.mockImplementation(async (channelId: number) =>
      channelId === 10
        ? {
            currentOrder: [
              { id: 7, currentRank: 2, lastProbedAt: 1, lastAlive: true },
              { id: 6, currentRank: 1, lastProbedAt: 1, lastAlive: false },
              { id: 8 },
            ],
          }
        : { currentOrder: [] },
    );
    const { channels } = await walkPreviews(p);
    expect(channels.find((c) => c.id === 10)).toEqual({
      id: 10,
      name: "Arena Sports",
      group: "Sport",
      groupId: 1,
      streams: [
        { streamId: 6, status: "dead" },
        { streamId: 7, status: "alive" },
        { streamId: 8, status: "unprobed" },
      ],
    });
  });

  it("shares one walk between callers until it goes stale", async () => {
    const p = podium();
    let t = 0;
    const index = createStreamIndex(p, () => t);
    await Promise.all([index(), index()]);
    await index();
    expect(p.state).toHaveBeenCalledOnce();
    t += 61_000;
    await index();
    expect(p.state).toHaveBeenCalledTimes(2);
  });

  it("does not walk again for 30 seconds after a walk fails", async () => {
    const p = podium();
    let t = 0;
    const index = createStreamIndex(p, () => t);
    p.preview.mockRejectedValueOnce(new UpstreamError("timeout"));
    await expect(index()).rejects.toThrow();
    t += 10_000;
    await expect(index()).rejects.toThrow();
    expect(p.state).toHaveBeenCalledOnce();
    t += 21_000;
    await expect(index()).resolves.toBeDefined();
    expect(p.state).toHaveBeenCalledTimes(2);
  });

  it("does not link a channel name that several channels share", async () => {
    const p = podium();
    p.state.mockResolvedValueOnce({ fetchedAt: 1, groups: [{ id: 1, name: "G", rows: [{ id: 10, name: "Same" }, { id: 12, name: "Same" }] }] });
    expect((await walkPreviews(p)).channelsByName.get("Same")).toBeNull();
  });
});

describe("openSoakTable", () => {
  it("logs each result once, returns them newest first, and prunes by completion time", () => {
    const table = openSoakTable(new DatabaseSync(":memory:"));
    expect(table.add([record({ completedAt: 100 }), record({ streamId: 2, completedAt: 200, unreachable: true })])).toBe(2);
    // The same result seen on the next walk is not logged again; a re-soak is.
    expect(table.add([record({ completedAt: 100 }), record({ completedAt: 300, drops: 1 })])).toBe(1);
    expect(table.between(0, 1000).map((r) => [r.streamId, r.completedAt, r.verdict])).toEqual([
      [1, 300, "dropped"],
      [2, 200, "unreachable"],
      [1, 100, "clean"],
    ]);
    expect(table.since()).toBe(100);
    expect(table.pruneBefore(150)).toBe(1);
    expect(table.since()).toBe(200);
  });
});

describe("summariseSoaks", () => {
  // Newest first, as the table returns them.
  const records = [
    record({ streamId: 1, completedAt: 500, provider: "Provider A", drops: 1 }),
    record({ streamId: 2, completedAt: 400, provider: "Provider B", unreachable: true, heldMs: 1000 }),
    record({ streamId: 1, completedAt: 300, provider: "Provider A", unreachable: true, heldMs: 1000 }),
    record({ streamId: 3, completedAt: 200, provider: "Provider A", heldMs: 120_000 }),
    record({ streamId: 2, completedAt: 100, provider: "Provider B", drops: 4 }),
  ];

  it("totals verdicts and counts distinct streams", () => {
    expect(summariseSoaks(records).totals).toEqual({ soaks: 5, clean: 1, dropped: 2, unreachable: 2, streams: 3 });
  });

  it("tallies providers, with the median hold of soaks that connected", () => {
    const [providerA, providerB] = summariseSoaks(records).providers;
    expect(providerA).toEqual({ name: "Provider A", soaks: 3, clean: 1, dropped: 1, unreachable: 1, streams: 2, medianHeldMs: 150_000, drops: 1 });
    expect(providerB).toMatchObject({ name: "Provider B", soaks: 2, streams: 1, medianHeldMs: 180_000, drops: 4 });
  });

  it("ranks streams that were not clean, worst first, with their latest result", () => {
    const { failing } = summariseSoaks(records);
    expect(failing.map((s) => [s.streamId, s.dropped + s.unreachable, s.drops, s.latest.completedAt])).toEqual([
      [2, 2, 4, 400],
      [1, 2, 1, 500],
    ]);
  });

  it("keeps the newest soaks", () => {
    expect(summariseSoaks(records).recent.map((r) => r.completedAt)).toEqual([500, 400, 300, 200, 100]);
  });
});

describe("createHistory soak log", () => {
  it("logs new soak results on each sample and serves the summary", async () => {
    const h = createHistory({
      file: ":memory:",
      stats: async () => ({}),
      providers: async () => ({ providers: [] }),
      soaks: async () => collectSoaks(await walkPreviews(podium())),
      connectEvents: async () => [],
      now: () => 10_000,
    });
    await h.sample();
    await h.sample();
    const res = h.readSoaks("24h");
    expect(res).toMatchObject({ enabled: true, range: "24h", since: 1000, totals: { soaks: 3, clean: 1, dropped: 1, unreachable: 1 } });
    h.close();
  });

  it("still takes the stats snapshot when the soak walk fails, and logs once", async () => {
    const log = vi.fn();
    let t = Date.now();
    const h = createHistory({
      file: ":memory:",
      stats: async () => ({}),
      providers: async () => ({ providers: [] }),
      soaks: async () => {
        throw new Error("preview failed");
      },
      connectEvents: async () => [],
      now: () => (t += 60_000),
      log,
    });
    await h.sample();
    await h.sample();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/soak log/);
    expect(h.read("24h").points).toHaveLength(2);
    h.close();
  });

  it("reports the log as off without a database", () => {
    const h = createHistory({ file: undefined, stats: vi.fn(), providers: vi.fn(), soaks: vi.fn(), connectEvents: vi.fn() });
    expect(h.readSoaks("7d")).toMatchObject({ enabled: false, totals: { soaks: 0 }, recent: [] });
    expect(h.readSoaks("7d").reason).toMatch(/HISTORY_DB/);
  });
});
