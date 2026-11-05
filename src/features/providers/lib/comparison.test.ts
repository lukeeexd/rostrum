import { describe, expect, it } from "vitest";
import type { ProviderStats } from "@/api/types";
import { bestIndexes } from "@/lib/best";
import { cellText, comparisonSections } from "./comparison";

const provider = (over: Partial<ProviderStats> = {}): ProviderStats => ({
  name: "P",
  maxStreams: 3,
  streams: { alive: 80, low_bitrate: 5, black: 5, dead: 10, unmeasured: 0 },
  deadReasons: { not_found: 3 },
  resolutions: { uhd: 1, fhd: 50, hd: 30, sd: 19, unknown: 0 },
  bitrateKbps: { all: 4500, fhd: 6000 },
  bitrateMeasured: 90,
  score: 0.51,
  verdictAgeSeconds: { median: 3600, max: 7200 },
  channels: 80,
  rank1Channels: 40,
  rank1Healthy: 30,
  ...over,
});

const row = (id: string, providers = [provider()]) =>
  comparisonSections(providers).flatMap((s) => s.rows).find((r) => r.id === id)!;

describe("bestIndexes", () => {
  it.each<[(number | null)[], "high" | "low" | undefined, number[]]>([
    [[1, 3, 2], "high", [1]],
    [[1, 3, 2], "low", [0]],
    [[3, 3, 1], "high", [0, 1]],
    [[2, 2], "high", []],
    [[5, null], "high", []],
    [[null, null], "low", []],
    [[1, 2], undefined, []],
  ])("%o (%s) → %o", (values, better, out) => {
    expect([...bestIndexes(values, better)]).toEqual(out);
  });
});

describe("comparisonSections", () => {
  it("turns stream states into shares of the provider's own total", () => {
    const r = row("dead");
    expect(r.value(provider())).toBeCloseTo(0.1);
    expect(cellText(r, provider())).toBe("10 · 10%");
    expect(r.better).toBe("low");
  });

  it("reads first-slot health as a share, and says so", () => {
    expect(cellText(row("rank1-healthy"), provider())).toBe("75% · 30 of 40");
    expect(cellText(row("rank1-healthy"), provider({ rank1Channels: 0, rank1Healthy: 0 }))).toBe("—");
  });

  it("formats bitrate, score and age, with a dash for missing readings", () => {
    expect(cellText(row("br-all"), provider())).toBe("4.5 Mbps");
    expect(cellText(row("br-uhd"), provider())).toBe("—");
    expect(cellText(row("score"), provider())).toBe("0.51");
    expect(cellText(row("age-max"), provider())).toBe("2h");
  });

  it("compares scores at the precision shown", () => {
    const providers = [provider({ score: 0.51 }), provider({ score: 0.511 }), provider({ score: 0.397 })];
    const r = row("score", providers);
    expect([...bestIndexes(providers.map(r.value), r.better)]).toEqual([0, 1]);
  });

  it("builds dead-reason rows from every provider's reasons, and none when nobody has dead streams", () => {
    const sections = comparisonSections([provider({ deadReasons: { timeout: 2 } }), provider({ deadReasons: { not_found: 1 } })]);
    const reasons = sections.find((s) => s.id === "dead-reasons")!.rows.map((r) => r.label);
    expect(reasons).toEqual(["not found", "timeout"]);
    expect(comparisonSections([provider({ deadReasons: {} })]).some((s) => s.id === "dead-reasons")).toBe(false);
  });
});
