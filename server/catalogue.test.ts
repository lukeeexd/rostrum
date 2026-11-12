import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import searchFixture from "../src/test/fixtures/podium-streams.json";
import stateFixture from "../src/test/fixtures/podium-state.json";
import { createCatalogueService, projectProviders, projectSearch } from "./catalogue";
import { parsePrometheus } from "./metrics";
import type { PodiumClient, PodiumState, PodiumStreamSearch } from "./podium";

const metricsText = readFileSync(new URL("../src/test/fixtures/podium-metrics.txt", import.meta.url), "utf8");

function podium(over: Partial<PodiumClient> = {}): PodiumClient {
  return {
    state: vi.fn(async () => stateFixture as unknown as PodiumState),
    preview: vi.fn(async () => ({})),
    searchStreams: vi.fn(async () => searchFixture as PodiumStreamSearch),
    metrics: vi.fn(async () => metricsText),
    stats: vi.fn(async () => ({})),
    connectStatus: vi.fn(async () => ({})),
    health: vi.fn(async () => ({ version: "1.17.0" })),
    verdicts: vi.fn(async () => ({})),
    probeHistory: vi.fn(async () => ({})),
    ...over,
  };
}

describe("parsePrometheus", () => {
  it("reads names, labels (with escapes) and values, skipping comments and junk", () => {
    const text = [
      "# HELP x help",
      'podium_provider_score{provider="Provider A",stat="median"} 0.51',
      'podium_provider_streams{provider="a \\"quoted\\" one",state="alive"} 208',
      "podium_up 1",
      "not a sample",
      'podium_bad{provider="x"} NaN',
      "",
    ].join("\n");
    expect(parsePrometheus(text)).toEqual([
      { name: "podium_provider_score", labels: { provider: "Provider A", stat: "median" }, value: 0.51 },
      { name: "podium_provider_streams", labels: { provider: 'a "quoted" one', state: "alive" }, value: 208 },
      { name: "podium_up", labels: {}, value: 1 },
    ]);
  });
});

describe("projectProviders", () => {
  const { providers } = projectProviders(parsePrometheus(metricsText), stateFixture as unknown as PodiumState);

  it("builds one record per provider from the live metrics, busiest first", () => {
    expect(providers.length).toBeGreaterThan(0);
    const rank1 = providers.map((p) => p.rank1Channels ?? 0);
    expect([...rank1].sort((a, b) => b - a)).toEqual(rank1);
    for (const p of providers) {
      expect(p.name).not.toBe("");
      expect(Object.keys(p.streams).sort()).toEqual(["alive", "black", "dead", "low_bitrate", "unmeasured"]);
      expect(Object.keys(p.resolutions).sort()).toEqual(["fhd", "hd", "sd", "uhd", "unknown"]);
      expect(p.score).not.toBeNull();
      expect(p.bitrateKbps.all).toBeGreaterThan(0);
      expect(p.rank1Healthy ?? 0).toBeLessThanOrEqual(p.rank1Channels ?? 0);
      expect(Object.values(p.deadReasons).every((n) => n > 0)).toBe(true);
    }
  });

  it("takes each provider's connection limit from Podium's state", () => {
    const limits = new Map(
      ((stateFixture as unknown as PodiumState).providers ?? []).map((p) => [p.name, p.maxStreams] as const),
    );
    for (const p of providers) if (limits.has(p.name)) expect(p.maxStreams).toBe(limits.get(p.name));
  });

  it("ignores series it does not know and samples without a provider", () => {
    const samples = parsePrometheus(
      ['podium_provider_new_thing{provider="X"} 5', "podium_provider_streams 3", 'podium_lane_limit{provider="X"} 2'].join("\n"),
    );
    expect(projectProviders(samples).providers).toMatchObject([{ name: "X", score: null, maxStreams: null }]);
  });
});

describe("projectSearch", () => {
  it("keeps names, counts, providers, samples and claiming channels from the live search", () => {
    const out = projectSearch(searchFixture as PodiumStreamSearch, "northgate news");
    expect(out.results.length).toBe((searchFixture as PodiumStreamSearch).groups!.length);
    expect(out.results[0]).toEqual({
      name: expect.any(String),
      count: expect.any(Number),
      providers: expect.any(Array),
      samples: expect.any(Array),
      channelIds: expect.any(Array),
    });
    expect(out.results.some((r) => r.channelIds.length > 0)).toBe(true);
    expect(out.results.some((r) => r.channelIds.length === 0)).toBe(true);
  });

  it("drops URLs and bad ids", () => {
    const out = projectSearch(
      { total: 1, groups: [{ normalized: "X", count: 1, samples: ["http://u:p@h.example/live/u/p/1.ts"], claimedByChannelIds: [5, -1, "x" as never] }] },
      "x",
    );
    expect(JSON.stringify(out)).not.toMatch(/live\/u\/p|u:p@/);
    expect(out.results[0].channelIds).toEqual([5]);
  });
});

describe("createCatalogueService", () => {
  it("caches searches for 30s per query, case-insensitively", async () => {
    let t = 0;
    const p = podium();
    const service = createCatalogueService({ podium: p, now: () => t });
    await service.search("Northgate News");
    await service.search("northgate news");
    expect(p.searchStreams).toHaveBeenCalledTimes(1);
    t = 30_001;
    await service.search("northgate news");
    expect(p.searchStreams).toHaveBeenCalledTimes(2);
  });

  it("still serves providers when Podium's state is unavailable, just without limits", async () => {
    const p = podium({ state: vi.fn(async () => Promise.reject(new Error("down"))) });
    const out = await createCatalogueService({ podium: p }).providers();
    expect(out.providers.length).toBeGreaterThan(0);
    expect(out.providers.every((x) => x.maxStreams === null)).toBe(true);
  });
});
