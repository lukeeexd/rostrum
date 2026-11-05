import { describe, expect, it, vi } from "vitest";
import type { PodiumClient, PodiumPreview, PodiumState, PodiumVerdicts } from "./podium";
import { createIndexLoader, indexFromVerdicts, VERDICTS_RECHECK_MS, VERSION_CHECK_MS, walkPreviews } from "./streams-index";
import { UpstreamError } from "./upstream";

const state: PodiumState = {
  fetchedAt: 1,
  groups: [
    { id: 1, name: "Sport", rows: [{ id: 10, name: "Arena Sports 1" }, { id: 11, name: "Spare" }] },
    { id: 2, name: "News", rows: [{ id: 12, name: "Northgate News" }] },
  ],
};

const soak = { completedAt: 5, heldMs: 180_000, drops: 0, failedDials: 0, unreachable: false };

/** The same three channels as Podium would describe them through /api/verdicts. */
const verdicts: PodiumVerdicts = {
  fetchedAt: 1,
  cacheUnavailable: false,
  channels: [
    { id: 10, name: "Arena Sports 1", groupId: 1, streams: [101, 102] },
    { id: 12, name: "Northgate News", groupId: 2, streams: [101, 103] },
  ],
  streams: [
    { id: 101, name: "Arena Sports 1 FHD", provider: "Provider A", lastProbedAt: 3, lastAlive: true, lastBlack: false, lastLowBitrate: false, lastBitrateKbps: 6000, lastSoak: soak },
    { id: 102, name: "Arena Sports 1 HD", provider: "Provider B", lastProbedAt: 3, lastAlive: false, lastBlack: false, lastBitrateKbps: 0, lastSoak: null },
    { id: 103, name: "Northgate News SD", provider: "Provider C", lastProbedAt: null, lastAlive: null, lastSoak: null },
  ],
};

/** The same, as each channel's preview would list it. */
const previews: Record<number, PodiumPreview> = {
  10: {
    currentOrder: [
      { id: 101, raw: "Arena Sports 1 FHD", provider: "Provider A", currentRank: 1, lastProbedAt: 3, lastAlive: true, lastBlack: false, lastLowBitrate: false, lastBitrateKbps: 6000, lastSoak: soak },
      { id: 102, raw: "Arena Sports 1 HD", provider: "Provider B", currentRank: 2, lastProbedAt: 3, lastAlive: false, lastBlack: false, lastBitrateKbps: 0, lastSoak: null },
    ],
  },
  11: { currentOrder: [] },
  12: {
    currentOrder: [
      { id: 101, raw: "Arena Sports 1 FHD", provider: "Provider A", currentRank: 1, lastProbedAt: 3, lastAlive: true, lastBlack: false, lastLowBitrate: false, lastBitrateKbps: 6000, lastSoak: soak },
      { id: 103, raw: "Northgate News SD", provider: "Provider C", currentRank: 2, lastProbedAt: null, lastAlive: null, lastSoak: null },
    ],
  },
};

type Mock = PodiumClient & { [K in "state" | "preview" | "verdicts" | "health"]: ReturnType<typeof vi.fn> };

function podium({ hasVerdicts = true, version = "1.18.0" } = {}): Mock {
  return {
    state: vi.fn(async () => state),
    preview: vi.fn(async (channelId: number) => previews[channelId]),
    verdicts: vi.fn(async () => {
      if (!hasVerdicts) throw new UpstreamError("status", 404);
      return verdicts;
    }),
    health: vi.fn(async () => ({ version })),
    searchStreams: vi.fn(),
    metrics: vi.fn(),
    stats: vi.fn(),
    connectStatus: vi.fn(),
  } as unknown as Mock;
}

describe("indexFromVerdicts", () => {
  it("builds the same index the preview walk does, empty channels included", async () => {
    const fromVerdicts = indexFromVerdicts(state, verdicts, 7)!;
    const fromWalk = await walkPreviews(podium(), { now: () => 7 });
    const { source: a, ...one } = fromVerdicts;
    const { source: b, ...two } = fromWalk;
    expect([a, b]).toEqual(["verdicts", "previews"]);
    expect(one).toEqual(two);
    expect(fromVerdicts.channels.map((c) => [c.id, c.streams.map((s) => `${s.streamId}:${s.status}`)])).toEqual([
      [10, ["101:alive", "102:dead"]],
      [11, []],
      [12, ["101:alive", "103:unprobed"]],
    ]);
  });

  it("gives up (null) when Podium could not read its cache, so the walk is used", () => {
    expect(indexFromVerdicts(state, { ...verdicts, cacheUnavailable: true }, 7)).toBeNull();
  });
});

describe("createIndexLoader", () => {
  it("uses one /api/verdicts call when Podium has it, and says so once", async () => {
    const p = podium();
    const log = vi.fn();
    const load = createIndexLoader(p, () => 0, log);
    expect((await load()).source).toBe("verdicts");
    await load();
    expect(p.preview).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/verdicts/);
  });

  it("walks the previews on a Podium without it, reading the state once, and stops asking", async () => {
    const p = podium({ hasVerdicts: false, version: "1.17.0" });
    let t = 0;
    const load = createIndexLoader(p, () => t, () => {});
    expect((await load()).source).toBe("previews");
    expect(p.state).toHaveBeenCalledOnce();
    t += 5 * 60_000;
    await load();
    expect(p.verdicts).toHaveBeenCalledOnce(); // not asked again on the next tick
  });

  it("asks again when Podium's version changes, or after the recheck interval", async () => {
    const p = podium({ hasVerdicts: false, version: "1.17.0" });
    let t = 0;
    const load = createIndexLoader(p, () => t, () => {});
    await load();
    // Upgraded: the next tick notices the new version and switches.
    p.health.mockResolvedValue({ version: "1.18.0" });
    p.verdicts.mockResolvedValue(verdicts);
    t += 5 * 60_000;
    expect((await load()).source).toBe("verdicts");

    // A Podium still without it is asked again after VERDICTS_RECHECK_MS even at the same version.
    const q = podium({ hasVerdicts: false, version: "1.17.0" });
    let u = 0;
    const loadQ = createIndexLoader(q, () => u, () => {});
    await loadQ();
    u += VERDICTS_RECHECK_MS;
    await loadQ();
    expect(q.verdicts).toHaveBeenCalledTimes(2);
  });

  it("treats an answer that is not the verdicts as not supported", async () => {
    const p = podium();
    p.verdicts.mockResolvedValue({ currentOrder: [] });
    expect((await createIndexLoader(p, () => 0, () => {})()).source).toBe("previews");
  });

  it("walks the previews when /api/verdicts fails this time, says so once, and asks it first again next time", async () => {
    const p = podium();
    const log = vi.fn();
    const load = createIndexLoader(p, () => 0, log);
    p.verdicts.mockRejectedValueOnce(new UpstreamError("timeout")).mockRejectedValueOnce(new UpstreamError("timeout"));
    expect((await load()).source).toBe("previews");
    expect((await load()).source).toBe("previews");
    expect(log.mock.calls.filter(([m]) => /verdicts failed/.test(m))).toHaveLength(1);
    expect((await load()).source).toBe("verdicts"); // not marked unsupported: tried again, and it answered
  });

  it("looks at an older Podium's version at most every few minutes", async () => {
    const p = podium({ hasVerdicts: false, version: "1.17.0" });
    let t = 0;
    const load = createIndexLoader(p, () => t, () => {});
    await load();
    const healthCalls = p.health.mock.calls.length;
    t += VERSION_CHECK_MS - 1;
    await load();
    expect(p.health.mock.calls.length).toBe(healthCalls);
    t += 1;
    await load();
    expect(p.health.mock.calls.length).toBe(healthCalls + 1);
  });
});
