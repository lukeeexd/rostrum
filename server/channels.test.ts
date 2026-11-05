import { describe, expect, it, vi } from "vitest";
import statefixture from "../src/test/fixtures/podium-state.json";
import previewFixture from "../src/test/fixtures/podium-preview.json";
import { createChannelsService, mediaFromPreview, projectGroups } from "./channels";
import { createLimiter } from "./load";
import { pickStats, type DispatcharrClient } from "./dispatcharr";
import type { PodiumClient, PodiumPreview, PodiumState } from "./podium";
import { UpstreamError } from "./upstream";

/** Streams on the captured channel; every one has been probed (see scripts/capture-fixtures.mjs). */
const N = (previewFixture as PodiumPreview).currentOrder!.length;

const SECRET = "http://user:SECRET123@cdn.example/live/user/SECRET123/1.ts";

/** Podium's real stream_stats keys (src/lib/stats.ts), as they appear in Dispatcharr. */
const STATS = {
  width: 1920, height: 1080, resolution: "1920x1080", source_fps: 25, reported_fps: 50, scan_type: "interlaced",
  video_codec: "h264", audio_codec: "aac", pixel_format: "yuv420p", hdr_format: "SDR", audio_channels: 2,
  channel_layout: "stereo", audio_bitrate: 128, sample_rate: 48000, video_bitrate: 4509, blank_detected: false,
};

function podium(state: unknown = statefixture, preview: unknown = previewFixture): PodiumClient {
  return {
    state: vi.fn(async () => state as PodiumState),
    preview: vi.fn(async () => preview as PodiumPreview),
    searchStreams: vi.fn(async () => ({})),
    metrics: vi.fn(async () => ""),
    stats: vi.fn(async () => ({})),
    connectStatus: vi.fn(async () => ({})),
    health: vi.fn(async () => ({ version: "1.17.0" })),
    verdicts: vi.fn(async () => ({})),
  };
}

function dispatcharr(impl: (id: number) => Promise<unknown>): DispatcharrClient & { streamMedia: ReturnType<typeof vi.fn> } {
  return { streamMedia: vi.fn(async (id: number) => pickStats(await impl(id))) };
}

describe("projectGroups", () => {
  it("keeps only group and channel identity from the live state", () => {
    const out = projectGroups(statefixture as unknown as PodiumState);
    expect(out.groups.length).toBe((statefixture as { groups: unknown[] }).groups.length);
    expect(Object.keys(out.groups[0]).sort()).toEqual(["channels", "id", "name"]);
    expect(Object.keys(out.groups[0].channels[0]).sort()).toEqual(["assigned", "id", "name"]);
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/Pattern|profiles|aliases/);
  });

  it("never lets a URL or credential through", () => {
    const state = {
      fetchedAt: 1,
      groups: [{ id: 1, name: `Sports ${SECRET}`, rows: [{ id: 2, name: SECRET, assigned: 1 }] }],
      providers: [{ profiles: [{ replacePattern: SECRET }] }],
    };
    const text = JSON.stringify(projectGroups(state as unknown as PodiumState));
    expect(text).not.toContain("SECRET123");
    expect(text).not.toContain("://");
  });
});

describe("pickStats", () => {
  it("whitelists Podium's stream_stats keys and units", () => {
    expect(pickStats({ ...STATS, url: SECRET })).toEqual({
      source: "dispatcharr", width: 1920, height: 1080, fps: 25, scanType: "interlaced", videoCodec: "h264",
      videoBitrateKbps: 4509, hdr: "SDR", audioCodec: "aac", audioChannels: 2, channelLayout: "stereo",
      audioBitrateKbps: 128, sampleRate: 48000,
    });
  });
  it("falls back to the raw fps reading", () => expect(pickStats({ reported_fps: 50 })?.fps).toBe(50));
  it.each([null, undefined, {}, { width: 0, video_codec: "" }])("is null when Podium never wrote stats (%o)", (raw) => {
    expect(pickStats(raw)).toBeNull();
  });
});

describe("streams", () => {
  it("returns the channel's streams in Dispatcharr order with Podium's verdicts", async () => {
    const service = createChannelsService({ podium: podium() });
    const out = await service.streams(1378);
    expect(out.streams.map((s) => s.rank)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(out.streams[0]).toMatchObject({ alive: true, height: 1080, black: false, media: null });
    expect(out.details).toEqual({ dispatcharr: false, missing: N });
  });

  it("fills FPS / codec / audio from Dispatcharr when configured", async () => {
    const d = dispatcharr(async () => STATS);
    const out = await createChannelsService({ podium: podium(), dispatcharr: d }).streams(1378);
    expect(d.streamMedia).toHaveBeenCalledTimes(N);
    expect(out.streams[0].media).toMatchObject({ source: "dispatcharr", fps: 25, audioCodec: "aac" });
    expect(out.details).toEqual({ dispatcharr: true, missing: 0 });
  });

  it("prefers Podium's own fields when its preview carries them, without calling Dispatcharr", async () => {
    const preview = { currentOrder: [{ id: 5, currentRank: 1, lastProbedAt: 1, lastAlive: true, lastHeight: 720, lastFps: 50, lastVideoCodec: "hevc", lastAudioCodec: "eac3", lastLowBitrate: true }] };
    const d = dispatcharr(async () => STATS);
    const out = await createChannelsService({ podium: podium(statefixture, preview), dispatcharr: d }).streams(9);
    expect(d.streamMedia).not.toHaveBeenCalled();
    expect(out.streams[0]).toMatchObject({ lowBitrate: true, media: { source: "podium", fps: 50, videoCodec: "hevc", height: 720 } });
  });

  it("skips Dispatcharr for streams Podium has never probed", async () => {
    const preview = { currentOrder: [{ id: 5, lastProbedAt: null }] };
    const d = dispatcharr(async () => STATS);
    await createChannelsService({ podium: podium(statefixture, preview), dispatcharr: d }).streams(9);
    expect(d.streamMedia).not.toHaveBeenCalled();
  });

  it("degrades per stream and reports why, instead of failing the channel", async () => {
    const d = dispatcharr(async (id) => {
      if (id === (previewFixture as PodiumPreview).currentOrder![1].id) throw new UpstreamError("status", 404);
      if (id === (previewFixture as PodiumPreview).currentOrder![2].id) throw new UpstreamError("timeout");
      return STATS;
    });
    const out = await createChannelsService({ podium: podium(), dispatcharr: d }).streams(1378);
    expect(out.streams[1].media).toBeNull();
    expect(out.streams[2].media).toBeNull();
    expect(out.streams[3].media).not.toBeNull();
    expect(out.details).toEqual({ dispatcharr: true, missing: 2, error: "timeout" });
  });

  it("names an API key Dispatcharr refuses", async () => {
    const d = dispatcharr(async () => Promise.reject(new UpstreamError("status", 401)));
    const out = await createChannelsService({ podium: podium(), dispatcharr: d }).streams(1378);
    expect(out.details.error).toBe("auth");
    expect(out.details.missing).toBe(N);
  });

  it("caches projected stats for 60s and does not cache failures", async () => {
    let t = 0;
    let fail = true;
    const d = dispatcharr(async () => {
      if (fail) throw new UpstreamError("unreachable");
      return STATS;
    });
    const service = createChannelsService({ podium: podium(), dispatcharr: d, now: () => t });
    await service.streams(1378);
    fail = false;
    await service.streams(1378);
    expect(d.streamMedia).toHaveBeenCalledTimes(2 * N); // failures were retried
    await service.streams(1378);
    expect(d.streamMedia).toHaveBeenCalledTimes(2 * N); // served from cache
    t = 61_000;
    await service.streams(1378);
    expect(d.streamMedia).toHaveBeenCalledTimes(3 * N);
  });

  it("never returns a stream URL or credential", async () => {
    const preview = { currentOrder: [{ id: 5, raw: SECRET, provider: SECRET, providerGroup: SECRET, lastProbedAt: 1 }] };
    const d = dispatcharr(async () => ({ ...STATS, video_codec: SECRET }));
    const text = JSON.stringify(await createChannelsService({ podium: podium(statefixture, preview), dispatcharr: d }).streams(1));
    expect(text).not.toContain("SECRET123");
    expect(text).not.toContain("://");
  });
});

describe("createLimiter", () => {
  it("never runs more than its slots at once, across callers", async () => {
    const limit = createLimiter(4);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 12 }, task));
    expect(peak).toBe(4);
  });
});

describe("mediaFromPreview", () => {
  it("is null for today's Podium preview, which has no media fields", () => {
    expect((previewFixture as PodiumPreview).currentOrder!.map(mediaFromPreview).every((m) => m === null)).toBe(true);
  });
});

describe("load control", () => {
  it("never lets a newcomer slip into a slot being handed over", async () => {
    const limit = createLimiter(1);
    let active = 0;
    let peak = 0;
    const job = () =>
      limit(async () => {
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        active--;
      });
    const first = job();
    const queued = job();
    // Arrives exactly while `first` is finishing and handing its slot to `queued`.
    await first;
    const late = job();
    await Promise.all([queued, late]);
    expect(peak).toBe(1);
  });

  it("shares one Dispatcharr fetch per stream between concurrent channel requests", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = dispatcharr(async () => {
      await gate;
      return STATS;
    });
    const service = createChannelsService({ podium: podium(), dispatcharr: d });
    const both = Promise.all([service.streams(1378), service.streams(1378)]);
    await new Promise((r) => setTimeout(r, 10));
    release();
    await both;
    expect(d.streamMedia).toHaveBeenCalledTimes(N);
  });

  it("does not fail other waiters when one caller gives up", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = dispatcharr(async () => {
      await gate;
      return STATS;
    });
    const service = createChannelsService({ podium: podium(), dispatcharr: d });
    const leaving = new AbortController();
    const a = service.streams(1378, leaving.signal);
    const b = service.streams(1378);
    await new Promise((r) => setTimeout(r, 10));
    leaving.abort();
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.details.error).toBe("timeout");
    expect(rb.details).toEqual({ dispatcharr: true, missing: 0 });
  });

  it("serves groups from a 10s cache and shares a load in flight", async () => {
    let t = 0;
    const p = podium();
    const service = createChannelsService({ podium: p, now: () => t });
    await Promise.all([service.groups(), service.groups()]);
    await service.groups();
    expect(p.state).toHaveBeenCalledTimes(1);
    t = 10_001;
    await service.groups();
    expect(p.state).toHaveBeenCalledTimes(2);
  });

  it("skips ids that are not positive integers instead of putting them in a URL", async () => {
    const preview = { currentOrder: [{ id: "../../users/", lastProbedAt: 1 }, { id: -3, lastProbedAt: 1 }, { id: 1.5 }, { id: 42, lastProbedAt: 1 }] };
    const d = dispatcharr(async () => STATS);
    const out = await createChannelsService({ podium: podium(statefixture, preview), dispatcharr: d }).streams(1);
    expect(out.streams.map((s) => s.id)).toEqual([42]);
    expect(d.streamMedia.mock.calls.map(([id]) => id)).toEqual([42]);
    const groups = projectGroups({ fetchedAt: 1, groups: [{ id: "x", name: "bad", rows: [] }, { id: 2, name: "ok", rows: [{ id: 0, name: "bad" }, { id: 3, name: "ok" }] }] } as unknown as PodiumState);
    expect(groups.groups).toEqual([{ id: 2, name: "ok", channels: [{ id: 3, name: "ok", assigned: 0 }] }]);
  });

  it("reports an unknown fetch time as null rather than the epoch", () => {
    expect(projectGroups({ groups: [] } as unknown as PodiumState).fetchedAt).toBeNull();
  });
});

describe("projectSoak", () => {
  it("keeps a finished soak and defaults missing counts to zero", async () => {
    const { projectSoak } = await import("./channels");
    expect(projectSoak({ completedAt: 5, heldMs: 90_000, drops: 2 })).toEqual({ completedAt: 5, heldMs: 90_000, drops: 2, failedDials: 0, unreachable: false });
    expect(projectSoak(null)).toBeNull();
    expect(projectSoak({ heldMs: 1 })).toBeNull();
    expect(projectSoak({ completedAt: 5, drops: -1, unreachable: true })).toMatchObject({ drops: 0, unreachable: true });
  });
});
