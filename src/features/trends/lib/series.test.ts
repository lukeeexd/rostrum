import { describe, expect, it } from "vitest";
import type { Snapshot } from "@/api/types";
import { freshnessRows, primaryRows, problemRows, providerRows } from "./series";

const point = (t: number, over: Partial<Snapshot> = {}): Snapshot => ({
  t,
  streams: { alive: 80, low_bitrate: 5, black: 5, dead: 10, unmeasured: 0, total: 100 },
  primary: { total: 120, healthy: 90 },
  freshness: { oldestSeconds: 7200, targetSeconds: 86_400 },
  providers: [
    { name: "Provider A", rank1: 40, rank1Healthy: 36, score: 0.5, bitrateKbps: 5000 },
  ],
  ...over,
});

describe("trend series", () => {
  it("lays out the problem states per point", () => {
    expect(problemRows([point(1)])).toEqual([{ t: 1, low_bitrate: 5, black: 5, dead: 10 }]);
  });

  it("turns primary health into a percentage, null without channels", () => {
    expect(primaryRows([point(1), point(2, { primary: { total: 0, healthy: 0 } })])).toEqual([
      { t: 1, healthy: 75 },
      { t: 2, healthy: null },
    ]);
  });

  it("reports freshness in hours against the target", () => {
    expect(freshnessRows([point(1), point(2, { freshness: { oldestSeconds: null, targetSeconds: 0 } })])).toEqual([
      { t: 1, oldest: 2, target: 24 },
      { t: 2, oldest: null, target: null },
    ]);
  });

  it("gives each provider a series, with gaps where it is missing", () => {
    const a = point(1);
    const b = point(2, {
      providers: [...a.providers, { name: "Provider C", rank1: 0, rank1Healthy: 0, score: null, bitrateKbps: 3000 }],
    });
    const healthy = providerRows([a, b], "healthyFirst");
    expect(healthy.series).toEqual([
      { key: "p0", name: "Provider A" },
      { key: "p1", name: "Provider C" },
    ]);
    expect(healthy.rows).toEqual([
      { t: 1, p0: 90, p1: null },
      { t: 2, p0: 90, p1: null },
    ]);
    expect(providerRows([b], "bitrate").rows).toEqual([{ t: 2, p0: 5, p1: 3 }]);
    expect(providerRows([b], "score").rows).toEqual([{ t: 2, p0: 0.5, p1: null }]);
  });
});

describe("trend formats", () => {
  it("rounds percentages and reads hours naturally", async () => {
    const { formatHours, formatPct } = await import("./series");
    expect(formatPct(74.6)).toBe("75%");
    expect(formatHours(0.75)).toBe("45m");
    expect(formatHours(2.46)).toBe("2.5h");
    expect(formatHours(24)).toBe("24h");
  });
});
