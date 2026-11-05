import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import statsFixture from "../src/test/fixtures/stats.json";
import stateFixture from "../src/test/fixtures/podium-state.json";
import type { ProvidersResponse, Snapshot } from "../src/api/types";
import { projectProviders } from "./catalogue";
import { HISTORY_RANGES } from "../src/lib/ranges";
import { createHistory, downsample, KEEP_MS, openHistoryStore, RANGE_MS, toSnapshot } from "./history";
import { parsePrometheus } from "./metrics";
import type { PodiumState, PodiumStats } from "./podium";

const providers: ProvidersResponse = projectProviders(
  parsePrometheus(readFileSync(new URL("../src/test/fixtures/podium-metrics.txt", import.meta.url), "utf8")),
  stateFixture as unknown as PodiumState,
);
const stats = statsFixture as unknown as PodiumStats;
const tmp = mkdtempSync(path.join(process.cwd(), "node_modules", ".tmp-history-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const snap = (t: number, alive: number): Snapshot => ({
  ...toSnapshot(t, stats, providers),
  streams: { alive, low_bitrate: 0, black: 0, dead: 0, unmeasured: 0, total: alive },
});

describe("toSnapshot", () => {
  it("records stream states, primary health, freshness and every provider from live data", () => {
    const s = toSnapshot(1000, stats, providers);
    expect(s.t).toBe(1000);
    expect(s.streams.total).toBe((statsFixture as { streams: { total: number } }).streams.total);
    expect(s.streams.alive).toBe((statsFixture as { streams: { states: { alive: number } } }).streams.states.alive);
    expect(s.primary.total).toBeGreaterThan(0);
    expect(s.freshness.targetSeconds).toBeGreaterThan(0);
    expect(s.providers.map((p) => p.name)).toEqual(providers.providers.map((p) => p.name));
    expect(s.providers[0].rank1Healthy).toBeLessThanOrEqual(s.providers[0].rank1);
  });

  it("copes with a Podium that reports nothing", () => {
    const s = toSnapshot(1, {}, { providers: [] });
    expect(s.streams.total).toBe(0);
    expect(s.freshness.oldestSeconds).toBeNull();
  });
});

describe("downsample", () => {
  it("returns raw points when they fit", () => {
    const points = [snap(30, 3), snap(10, 1), snap(20, 2)];
    expect(downsample(points, 0, 100, 10).map((p) => p.t)).toEqual([10, 20, 30]);
  });

  it("averages into buckets, stamps bucket middles and leaves gaps out", () => {
    const points = [snap(0, 10), snap(1, 20), snap(2, 30), snap(98, 100)];
    const out = downsample(points, 0, 100, 2);
    expect(out.map((p) => [p.t, p.streams.alive])).toEqual([
      [25, 20],
      [75, 100],
    ]);
    expect(downsample([snap(0, 1), snap(1, 1), snap(2, 1)], 0, 100, 2)).toHaveLength(1);
  });

  it("averages each provider by name, and ignores points outside the range", () => {
    const a = snap(0, 1);
    const b = { ...snap(1, 1), providers: a.providers.map((p) => ({ ...p, rank1: p.rank1 + 10 })) };
    const [out] = downsample([a, b, snap(500, 1)], 0, 100, 1);
    expect(out.providers[0].rank1).toBe(a.providers[0].rank1 + 5);
  });
});

describe("openHistoryStore", () => {
  it("keeps snapshots across reopening, by time, and prunes old ones", () => {
    const file = path.join(tmp, "nested", "rostrum.db");
    const store = openHistoryStore(file);
    store.add(snap(100, 1));
    store.add(snap(200, 2));
    store.add(snap(300, 3));
    store.close();

    const again = openHistoryStore(file);
    expect(again.between(150, 300).map((s) => s.streams.alive)).toEqual([2, 3]);
    expect(again.since()).toBe(100);
    expect(again.pruneBefore(250)).toBe(2);
    expect(again.since()).toBe(300);
    again.close();
  });
});

describe("createHistory", () => {
  it("is off, with a reason, when no database is configured", () => {
    const h = createHistory({ file: undefined, stats: vi.fn(), providers: vi.fn(), soaks: vi.fn(), connectEvents: vi.fn() });
    expect(h.enabled).toBe(false);
    const res = h.read("7d");
    expect(res).toMatchObject({ enabled: false, points: [], since: null });
    expect(res.reason).toMatch(/HISTORY_DB/);
  });

  it("is off, not crashing, when the database cannot be opened", () => {
    const blocker = path.join(tmp, "a-file");
    writeFileSync(blocker, "x");
    const log = vi.fn();
    const h = createHistory({ file: path.join(blocker, "rostrum.db"), stats: vi.fn(), providers: vi.fn(), soaks: vi.fn(), connectEvents: vi.fn(), log });
    expect(h.enabled).toBe(false);
    expect(h.read("24h").reason).toMatch(/cannot open/);
    expect(log).toHaveBeenCalledOnce();
  });

  it("samples, serves the requested range and drops snapshots older than 90 days", async () => {
    let t = KEEP_MS + 10 * 60_000;
    const h = createHistory({
      file: path.join(tmp, "sampled.db"),
      stats: async () => stats,
      providers: async () => providers,
      soaks: async () => [],
      connectEvents: async () => [],
      now: () => t,
    });
    await h.sample();
    t += 5 * 60_000;
    await h.sample();
    const day = h.read("24h");
    expect(day.enabled).toBe(true);
    expect(day.points).toHaveLength(2);
    expect(day.since).toBe(KEEP_MS + 10 * 60_000);

    t += KEEP_MS + 60_000;
    await h.sample();
    expect(h.read("90d").points).toHaveLength(1);
    h.close();
  });

  it("logs a failing sample once and keeps going", async () => {
    const log = vi.fn();
    let fail = true;
    const h = createHistory({
      file: ":memory:",
      stats: async () => {
        if (fail) throw new Error("Podium is down");
        return stats;
      },
      providers: async () => providers,
      soaks: async () => [],
      connectEvents: async () => [],
      log,
    });
    await h.sample();
    await h.sample();
    expect(log).toHaveBeenCalledOnce();
    fail = false;
    await h.sample();
    expect(h.read("24h").points).toHaveLength(1);
    h.close();
  });
});

describe("ranges", () => {
  it("accepts exactly the ranges the pages offer", () => {
    expect(Object.keys(RANGE_MS)).toEqual(HISTORY_RANGES.map((r) => r.id));
  });
});

describe("problem counts in snapshots", () => {
  const counts = (n: number) => ({ noHealthy: n, badFirst: 0, oneProvider: 2 * n, empty: 1 });

  it("records them when the walk answers, and averages them over the snapshots that have them", () => {
    const a = toSnapshot(0, stats, providers, counts(2));
    const b = toSnapshot(1, stats, providers, counts(4));
    const without = toSnapshot(2, stats, providers);
    expect(a.problems).toEqual(counts(2));
    expect(without.problems).toBeUndefined();
    const [avg] = downsample([a, b, without], 0, 100, 1);
    expect(avg.problems).toEqual(counts(3));
    expect(downsample([without, toSnapshot(3, stats, providers)], 0, 100, 1)[0].problems).toBeUndefined();
  });

  it("still takes the snapshot when the walk fails", async () => {
    const h = createHistory({
      file: ":memory:",
      stats: async () => stats,
      providers: async () => providers,
      problems: async () => {
        throw new Error("walk failed");
      },
      soaks: async () => [],
      connectEvents: async () => [],
    });
    await h.sample();
    const [point] = h.read("24h").points;
    expect(point).toBeDefined();
    expect(point.problems).toBeUndefined();
    h.close();
  });
});
