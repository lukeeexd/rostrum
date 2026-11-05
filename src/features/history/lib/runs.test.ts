import { describe, expect, it } from "vitest";
import type { ProgressResponse, RunRow } from "@/api/types";
import fixture from "@/test/fixtures/progress.json";
import { collapseRuns, isQuiet } from "./runs";

let seq = 0;
const run = (over: Partial<RunRow> = {}): RunRow => ({
  run_id: `r${seq++}`,
  started_at: 1000,
  finished_at: 2000,
  channels: 0,
  probed: 0,
  cached: 600,
  dead: 0,
  reordered: 0,
  skipped: 0,
  error: null,
  ...over,
});

describe("isQuiet", () => {
  it("is true for a finished pass that did nothing", () => expect(isQuiet(run())).toBe(true));
  it.each<Partial<RunRow>>([
    { probed: 2 },
    { dead: 1 },
    { reordered: 1 },
    { deferred: 3 },
    { measured: 9 },
    { error: "Could not reach Dispatcharr" },
    { finished_at: null },
  ])("is false for %o", (over) => expect(isQuiet(run(over))).toBe(false));
});

describe("collapseRuns", () => {
  it("handles an empty list", () => expect(collapseRuns([])).toEqual([]));

  it("merges consecutive quiet passes and keeps order", () => {
    const [a, b, c, d, e] = [run(), run(), run({ probed: 3 }), run(), run()];
    const items = collapseRuns([a, b, c, d, e]);
    expect(items).toEqual([
      { kind: "quiet", count: 2, newest: a, oldest: b },
      { kind: "run", run: c },
      { kind: "quiet", count: 2, newest: d, oldest: e },
    ]);
  });

  it("never merges across an errored pass", () => {
    const items = collapseRuns([run(), run({ error: "boom" }), run()]);
    expect(items.map((i) => i.kind)).toEqual(["quiet", "run", "quiet"]);
  });

  it("keeps a single quiet pass as count 1", () => {
    expect(collapseRuns([run()])).toMatchObject([{ kind: "quiet", count: 1 }]);
  });

  it("accounts for every run in the live fixture", () => {
    const runs = (fixture as unknown as ProgressResponse).runs;
    const items = collapseRuns(runs);
    const total = items.reduce((n, i) => n + (i.kind === "quiet" ? i.count : 1), 0);
    expect(total).toBe(runs.length);
    expect(items.length).toBeLessThan(runs.length);
  });
});
