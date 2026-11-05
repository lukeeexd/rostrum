import { describe, expect, it } from "vitest";
import { formatAgo, formatCountdown, formatPercent, formatSeconds, percent } from "./format";

describe("formatSeconds", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [NaN, "—"],
    [-4, "0s"],
    [0, "0s"],
    [59.4, "59s"],
    [60, "1m"],
    [75, "1m 15s"],
    [3600, "1h"],
    [8040, "2h 14m"],
    [86400, "1d"],
    [97200, "1d 3h"],
    [36853, "10h 14m"],
  ])("%s → %s", (input, out) => {
    expect(formatSeconds(input as number | null)).toBe(out);
  });
});

describe("relative times", () => {
  const now = 1_000_000_000;
  it("formats ages", () => {
    expect(formatAgo(null, now)).toBe("never");
    expect(formatAgo(now - 2_000, now)).toBe("just now");
    expect(formatAgo(now - 125_000, now)).toBe("2m 5s ago");
  });
  it("formats countdowns, clamping past times to due", () => {
    expect(formatCountdown(null, now)).toBe("not scheduled");
    expect(formatCountdown(now - 1, now)).toBe("due now");
    expect(formatCountdown(now + 250_000, now)).toBe("in 4m 10s");
  });
});

describe("percent", () => {
  it("guards a zero whole and clamps", () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(12, 10)).toBe(100);
    expect(formatPercent(85, 123)).toBe("69%");
    expect(formatPercent(1, 0)).toBe("—");
  });
});
