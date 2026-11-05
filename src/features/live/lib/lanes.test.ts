import { describe, expect, it } from "vitest";
import { heldBackEntries, laneProgress } from "./lanes";

const lane = { id: 1, name: "Provider A", limit: 3, done: 6, failed: 2, queued: 12, current: ["A", "B"] };

describe("laneProgress", () => {
  it("counts failed probes as completed work", () => {
    expect(laneProgress(lane)).toEqual({ completed: 8, total: 20, inFlight: 2, dead: 0, failed: 2 });
  });
  it("uses dead when Podium sends it", () => {
    expect(laneProgress({ ...lane, dead: 3 }).dead).toBe(3);
  });
  it("handles an empty lane", () => {
    expect(laneProgress({ ...lane, done: 0, failed: 0, queued: 0, current: [] })).toMatchObject({ completed: 0, total: 0, inFlight: 0 });
  });
});

describe("heldBackEntries", () => {
  it("sorts by count and drops zeros", () => {
    expect(heldBackEntries({ "no live programme": 55, "watch pause": 0, "after kickoff": 3, alpha: 3 })).toEqual([
      ["no live programme", 55],
      ["after kickoff", 3],
      ["alpha", 3],
    ]);
  });
});
