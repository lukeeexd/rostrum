import { describe, expect, it } from "vitest";
import { isActivePhase, progressInterval } from "./phase";
import { workerNotice } from "./worker";

describe("progressInterval", () => {
  it("polls every 2s while a pass is working, else every 10s", () => {
    expect(progressInterval("probing")).toBe(2_000);
    expect(progressInterval("planning")).toBe(2_000);
    expect(progressInterval("soaking")).toBe(10_000);
    expect(progressInterval("done")).toBe(10_000);
    expect(progressInterval(undefined)).toBe(10_000);
  });
  it("treats only fetching/planning/probing as active", () => {
    expect(["idle", "fetching", "planning", "probing", "soaking", "paused", "done", "failed"].filter((p) => isActivePhase(p as never)))
      .toEqual(["fetching", "planning", "probing"]);
  });
});

describe("workerNotice", () => {
  it("says nothing for an active worker and is only informational when disabled", () => {
    expect(workerNotice("active")).toBeNull();
    expect(workerNotice(undefined)).toBeNull();
    expect(workerNotice("disabled")?.tone).toBe("info");
    expect(workerNotice("stale")?.tone).toBe("warn");
  });
});
