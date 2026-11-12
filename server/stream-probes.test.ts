import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { StreamStatus } from "../src/lib/streamStatus";
import { openProbesTable } from "./stream-probes";

const DAY = 24 * 3600_000;
const probe = (streamId: number, probedAt: number, status: StreamStatus = "alive") => ({
  streamId,
  probedAt,
  status,
  name: `S${streamId}`,
  provider: "Provider A",
});
const table = () => openProbesTable(new DatabaseSync(":memory:"));
const keys = (rows: { stream_id: number; probed_at: number }[]) => rows.map((r) => [r.stream_id, r.probed_at]);

describe("openProbesTable", () => {
  it("stores each probe once, however often it is reported", () => {
    const probes = table();
    expect(probes.add([probe(1, DAY), probe(2, DAY)])).toBe(2);
    expect(probes.add([probe(1, DAY), probe(1, 2 * DAY, "dead")])).toBe(1);
    expect(keys(probes.between(0, 10 * DAY))).toEqual([
      [1, DAY],
      [1, 2 * DAY],
      [2, DAY],
    ]);
    expect(probes.since()).toBe(DAY);
  });

  it("reads each stream's probe in force when the window opens, then the ones inside it, for chosen streams too", () => {
    const probes = table();
    probes.add([probe(1, DAY), probe(1, 3 * DAY), probe(1, 5 * DAY), probe(2, 4 * DAY), probe(3, 9 * DAY)]);
    expect(keys(probes.between(4 * DAY, 6 * DAY))).toEqual([
      [1, 3 * DAY],
      [1, 5 * DAY],
      [2, 4 * DAY],
    ]);
    expect(keys(probes.between(4 * DAY, 6 * DAY, [2, 3]))).toEqual([[2, 4 * DAY]]);
    expect(probes.between(0, DAY, [])).toEqual([]);
  });

  it("prunes old probes but keeps each stream's last one before the cutoff, and drops streams gone since", () => {
    const probes = table();
    probes.add([probe(1, DAY), probe(1, 2 * DAY), probe(1, 6 * DAY), probe(2, DAY)]);
    expect(probes.pruneBefore(5 * DAY)).toBe(2);
    expect(keys(probes.between(0, 10 * DAY))).toEqual([
      [1, 2 * DAY],
      [1, 6 * DAY],
    ]);
  });
});
