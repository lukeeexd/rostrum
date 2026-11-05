import { describe, expect, it } from "vitest";
import type { DeadEntry, DeadResponse } from "@/api/types";
import fixture from "@/test/fixtures/dead.json";
import { filterEntries, sortEntries, streakTone } from "./dead";

const entry = (over: Partial<DeadEntry>): DeadEntry => ({
  streamId: 1,
  name: "Stream",
  providerId: 1,
  provider: "P",
  status: "dead",
  probedAt: 0,
  deadStreak: 1,
  error: "timeout",
  bitrateKbps: 0,
  height: 0,
  channels: [],
  ...over,
});

describe("sortEntries", () => {
  it("puts streams served first, then long streaks, then recent ones on top", () => {
    const a = entry({ streamId: 1, deadStreak: 6, channels: [{ id: 1, name: "A", groupId: 1, rank: 4 }] });
    const b = entry({ streamId: 2, deadStreak: 1, channels: [{ id: 2, name: "B", groupId: 1, rank: 1 }] });
    const c = entry({ streamId: 3, deadStreak: 3, channels: [] });
    const d = entry({ streamId: 4, deadStreak: 6, probedAt: 9, channels: [{ id: 3, name: "C", groupId: 1, rank: 4 }] });
    expect(sortEntries([c, a, b, d]).map((e) => e.streamId)).toEqual([2, 4, 1, 3]);
  });

  it("does not mutate its input", () => {
    const list = [entry({ streamId: 2, deadStreak: 1 }), entry({ streamId: 1, deadStreak: 5 })];
    sortEntries(list);
    expect(list[0].streamId).toBe(2);
  });
});

describe("filterEntries", () => {
  const entries = (fixture as unknown as DeadResponse).entries;

  it("filters by status", () => {
    const black = filterEntries(entries, "black", "");
    expect(black.length).toBeGreaterThan(0);
    expect(black.every((e) => e.status === "black")).toBe(true);
    expect(filterEntries(entries, "all", "")).toHaveLength(entries.length);
  });

  it("matches stream, provider and channel names case-insensitively", () => {
    const first = entries[0];
    expect(filterEntries(entries, "all", first.name.toUpperCase())).toContainEqual(first);
    expect(filterEntries(entries, "all", first.provider)).toContainEqual(first);
    expect(filterEntries(entries, "all", "zz-no-such-stream-zz")).toEqual([]);
  });
});

describe("streakTone", () => {
  it.each([
    [1, "neutral"],
    [2, "warn"],
    [5, "bad"],
  ])("%i → %s", (n, tone) => expect(streakTone(n)).toBe(tone));
});
