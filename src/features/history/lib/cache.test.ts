import { describe, expect, it } from "vitest";
import { cacheAgeSegments } from "./cache";

describe("cacheAgeSegments", () => {
  it("splits the cache into age buckets that sum to 100%", () => {
    const segs = cacheAgeSegments({ hour: 3, sixHours: 137, day: 515, older: 0 });
    expect(segs.map((s) => s.key)).toEqual(["hour", "sixHours", "day", "older"]);
    expect(segs.reduce((n, s) => n + s.pct, 0)).toBeCloseTo(100);
    expect(segs.find((s) => s.key === "older")).toMatchObject({ count: 0, pct: 0, warn: true });
  });
  it("is all zero for an empty cache", () => {
    expect(cacheAgeSegments({ hour: 0, sixHours: 0, day: 0, older: 0 }).every((s) => s.pct === 0)).toBe(true);
  });
});
