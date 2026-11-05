import { describe, expect, it } from "vitest";
import { formatSoak, notClean, soakNeedsAttention, soakVerdict } from "./soak";

const soak = { completedAt: 1, heldMs: 90_000, drops: 0, failedDials: 0, unreachable: false };

describe("soakVerdict", () => {
  it("is unreachable when Podium could not connect, dropped on any drop or redial, clean otherwise", () => {
    expect(soakVerdict({ drops: 1, failedDials: 5, unreachable: true })).toBe("unreachable");
    expect(soakVerdict({ drops: 2, failedDials: 0, unreachable: false })).toBe("dropped");
    expect(soakVerdict({ drops: 0, failedDials: 1, unreachable: false })).toBe("dropped");
    expect(soakVerdict({ drops: 0, failedDials: 0, unreachable: false })).toBe("clean");
  });
});

describe("notClean", () => {
  it("counts dropped and unreachable soaks", () => {
    expect(notClean({ soaks: 6, clean: 3, dropped: 2, unreachable: 1 })).toBe(3);
  });
});

describe("formatSoak", () => {
  it.each([
    [null, "—"],
    [soak, "clean · 1m 30s"],
    [{ ...soak, drops: 1 }, "1 drop · 1m 30s"],
    [{ ...soak, drops: 3, failedDials: 2 }, "3 drops, 2 failed dials · 1m 30s"],
    [{ ...soak, unreachable: true, drops: 5 }, "unreachable"],
  ])("%o → %s", (input, out) => expect(formatSoak(input)).toBe(out));
});

describe("soakNeedsAttention", () => {
  it("flags drops, failed dials and unreachable streams only", () => {
    expect([null, soak, { ...soak, drops: 1 }, { ...soak, failedDials: 2 }, { ...soak, unreachable: true }].map(soakNeedsAttention)).toEqual([
      false, false, true, true, true,
    ]);
  });
});
