import { Hono } from "hono";
import {
  allChannels,
  allStreams,
  playable,
  probeHistoryOf,
  PROVIDERS,
  random,
  type DemoChannel,
  type DemoGroup,
  type DemoStream,
} from "./catalogue";

/**
 * Just enough of Podium's HTTP API, over the made-up catalogue, for every
 * Rostrum page to have something to show. Read endpoints answer from the
 * catalogue; the re-check and soak queues accept requests and remember them
 * for the session. Response shapes follow Podium 1.17 (see
 * src/test/fixtures), plus the newer `channels` re-check scope, the
 * preview's `last*` media fields, GET /api/verdicts and GET /api/probe-history.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

export function createDemoPodium(groups: DemoGroup[], now: () => number = Date.now) {
  const channels = allChannels(groups);
  const streams = allStreams(groups);
  const providerOf = new Map(PROVIDERS.map((p) => [p.name, p]));
  const started = now();

  const first = (c: DemoChannel) => c.streams[0];
  const marks = { all: null as number | null, groups: {} as Record<string, number>, channels: {} as Record<string, number> };
  const soakQueue = new Map<number, "manual" | "now" | "sweep">();
  // A few streams waiting for tonight's sweep, and one asked for by hand.
  for (const s of streams.filter((s) => s.status === "alive").slice(3, 15)) soakQueue.set(s.id, "sweep");
  soakQueue.set(streams.find((s) => s.status === "alive")!.id, "manual");

  const app = new Hono();

  app.get("/api/health", (c) => c.json({ status: "ok", version: "1.18.0", worker: "active", heartbeatAgeSeconds: 2 }));

  app.get("/api/stats", (c) => {
    const states = { alive: 0, dead: 0, black: 0, low_bitrate: 0, unmeasured: 0 };
    for (const s of streams) states[s.status === "unprobed" ? "unmeasured" : s.status]++;
    const served = channels.filter((ch) => ch.streams.length);
    return c.json({
      worker: "active",
      heartbeatAgeSeconds: 2,
      catalogueWrittenAt: now() - 4 * MIN,
      streams: { total: streams.length, measured: streams.length - states.unmeasured, healthy: states.alive, states },
      primary: { total: served.length, healthy: served.filter((ch) => playable(first(ch))).length },
      providers: PROVIDERS.map((p) => {
        const mine = served.filter((ch) => first(ch).provider === p.name);
        return { name: p.name, primary: mine.length, healthy: mine.filter((ch) => playable(first(ch))).length };
      }),
      freshness: { oldestProbeAgeSeconds: 19 * 3600, targetSeconds: 24 * 3600, breaching: false },
      lastRun: run(0),
    });
  });

  /** The i-th most recent pass, every 15 minutes back from now. */
  function run(i: number) {
    const rnd = random(1000 + i);
    const startedAt = now() - i * 15 * MIN - 3 * MIN;
    const probed = i % 4 === 0 ? 8 + Math.floor(rnd() * 30) : Math.floor(rnd() * 4);
    return {
      run_id: `run-${startedAt}`,
      started_at: startedAt,
      finished_at: startedAt + (probed ? 20_000 + probed * 1500 : 900),
      channels: channels.length,
      probed,
      cached: streams.length - probed,
      dead: Math.floor(probed / 9),
      reordered: Math.floor(probed / 6),
      unchanged: channels.length - Math.floor(probed / 6),
      assigned: 0,
      measured: probed,
      skipped: 0,
      deferred: 0,
      backlog: 0,
      next_due_at: startedAt + 15 * MIN,
      oldest_probed_at: now() - 19 * HOUR,
      error: null,
      removed: 0,
    };
  }

  app.get("/api/progress", (c) => {
    const rnd = random(Math.floor(now() / 10_000));
    const lanes = PROVIDERS.map((p, i) => ({
      id: p.id,
      name: p.name,
      limit: p.maxStreams,
      done: 14 + i * 5 + Math.floor(rnd() * 4),
      dead: i,
      failed: i === 1 ? 1 : 0,
      queued: 9 - i * 3,
      current: streams.filter((s) => s.provider === p.name && s.status !== "unprobed").slice(0, p.maxStreams).map((s) => s.name),
    }));
    const activity = Array.from({ length: 24 }, (_, h) => {
      const r = random(h + 7);
      const probed = h === 3 ? 420 : h === 15 ? 180 : Math.floor(r() * 40);
      return { from: now() - (24 - h) * HOUR, probed, dead: Math.floor(probed * 0.06) };
    });
    const runs = Array.from({ length: 30 }, (_, i) => run(i));
    const done = lanes.reduce((n, l) => n + l.done, 0);
    const queued = lanes.reduce((n, l) => n + l.queued, 0);
    return c.json({
      progress: {
        runId: `run-${started}`,
        phase: "probing",
        startedAt: now() - 95_000,
        probed: done,
        total: done + queued,
        dead: 3,
        reordered: 2,
        unchanged: 0,
        cached: streams.length - done - queued,
        deferred: 0,
        backlog: 0,
        dueAt: now() + 4 * HOUR,
        heldBack: { "no live programme": 3, "kick-off not reached": 2 },
        lanes,
        message: `probing ${done + queued} streams`,
        nextRunAt: now() + 12 * MIN,
        tickMs: 60_000,
        maxAgeMs: 24 * HOUR,
        oldestManagedProbedAt: now() - 19 * HOUR,
        retired: 0,
        measured: done,
        updatedAt: now(),
      },
      stale: false,
      worker: "active",
      heartbeatAgeSeconds: 1,
      refresh: { all: marks.all, groups: Object.keys(marks.groups).length, channels: Object.keys(marks.channels).length },
      runs,
      stats: {
        cache: {
          total: streams.length,
          alive: streams.filter(playable).length,
          dead: streams.filter((s) => s.status === "dead").length,
          oldestProbedAt: now() - 19 * HOUR,
          newestProbedAt: now() - 40_000,
          due: queued,
          nextDueAt: now() + 20 * MIN,
          ages: { hour: 21, sixHours: 34, day: streams.length - 55, older: 0 },
        },
        day: {
          passes: 96,
          working: 41,
          probed: activity.reduce((n, a) => n + a.probed, 0),
          dead: activity.reduce((n, a) => n + a.dead, 0),
          reordered: 37,
          failed: 0,
        },
        activity,
        liveTtlMs: 24 * HOUR,
        deadTtlMs: 2 * HOUR,
        deadTtlMaxMs: 12 * HOUR,
        maxAgeMs: 24 * HOUR,
      },
    });
  });

  const onChannels = (s: DemoStream) =>
    channels.flatMap((ch) => {
      const rank = ch.streams.indexOf(s);
      return rank < 0 ? [] : [{ id: ch.id, name: ch.name, groupId: ch.groupId, rank: rank + 1 }];
    });

  app.get("/api/dead", (c) => {
    const bad = streams.filter((s) => s.status === "dead" || s.status === "black");
    const entries = bad.map((s) => ({
      streamId: s.id,
      name: s.name,
      providerId: providerOf.get(s.provider)!.id,
      provider: s.provider,
      status: s.status,
      probedAt: s.probedAt,
      deadStreak: s.deadStreak,
      error: s.error,
      bitrateKbps: s.bitrateKbps,
      height: s.height,
      channels: onChannels(s),
    }));
    return c.json({
      fetchedAt: now(),
      totals: {
        dead: bad.filter((s) => s.status === "dead").length,
        black: bad.filter((s) => s.status === "black").length,
        orphans: 0,
        channelsServedFirst: channels.filter((ch) => ch.streams[0] && !playable(ch.streams[0]) && ch.streams[0].status !== "unprobed").length,
        channelsAffected: new Set(entries.flatMap((e) => e.channels.map((ch) => ch.id))).size,
        worstStreak: Math.max(0, ...bad.map((s) => s.deadStreak)),
        oldestProbedAt: Math.min(...bad.map((s) => s.probedAt ?? now())),
      },
      providers: PROVIDERS.map((p) => ({
        id: p.id,
        name: p.name,
        dead: bad.filter((s) => s.provider === p.name && s.status === "dead").length,
        black: bad.filter((s) => s.provider === p.name && s.status === "black").length,
        streams: streams.filter((s) => s.provider === p.name).length,
      })),
      channels: channels
        .filter((ch) => ch.streams.some((s) => s.status === "dead"))
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          groupId: ch.groupId,
          deadCount: ch.streams.filter((s) => s.status === "dead").length,
          assigned: ch.streams.length,
          servedFirstDead: ch.streams[0]?.status === "dead",
        })),
      entries,
      entryTotal: entries.length,
      truncated: false,
      cacheUnavailable: false,
    });
  });

  // --- the queues: soak and re-check ---------------------------------------------------------
  const soakCounts = () => {
    const sources = [...soakQueue.values()];
    return {
      total: sources.length,
      manual: sources.filter((s) => s === "manual").length,
      now: sources.filter((s) => s === "now").length,
      sweep: sources.filter((s) => s === "sweep").length,
    };
  };
  app.get("/api/soak", (c) => c.json({ ...soakCounts(), streamIds: [...soakQueue.keys()] }));
  app.post("/api/soak", async (c) => {
    const { scope, id } = (await c.req.json()) as { scope: string; id: number };
    const ids = scope === "stream" ? [id] : (channels.find((ch) => ch.id === id)?.streams ?? []).filter((s) => s.status !== "dead").map((s) => s.id);
    const before = soakQueue.size;
    for (const s of ids) soakQueue.set(s, "manual");
    return c.json({ status: "queued", label: `${scope} ${id}`, requested: ids.length, queued: soakQueue.size - before, skippedDead: 0, source: "manual", seconds: null, ...soakCounts() });
  });
  app.delete("/api/soak", (c) => {
    const id = Number(c.req.query("streamId"));
    const cleared = soakQueue.delete(id) ? 1 : 0;
    return c.json({ status: "cleared", cleared, ...soakCounts() });
  });

  app.get("/api/refresh", (c) => c.json(marks));
  app.post("/api/refresh", async (c) => {
    const body = (await c.req.json()) as { scope: string; groupId?: number; channelId?: number };
    const at = now();
    if (body.scope === "all") marks.all = at;
    if (body.scope === "group") marks.groups[String(body.groupId)] = at;
    if (body.scope === "channel") marks.channels[String(body.channelId)] = at;
    return c.json({ queued: true, scope: body.scope, forcedAt: at });
  });
  app.delete("/api/refresh", (c) => {
    const scope = c.req.query("scope");
    if (scope === "all") marks.all = null;
    if (scope === "group") delete marks.groups[c.req.query("groupId") ?? ""];
    if (scope === "channel") delete marks.channels[c.req.query("channelId") ?? ""];
    return c.json({ cancelled: true, scope });
  });

  // --- Dispatcharr Connect --------------------------------------------------------------------
  const recent = connectEvents(groups, now());
  app.get("/api/connect/status", (c) =>
    c.json({
      state: "listening",
      enabled: true,
      stabilityEnabled: true,
      summary: {
        trackingSince: now() - 30 * 24 * HOUR,
        accepted: recent.length,
        rejected: 0,
        lastReceivedAt: recent[0]?.receivedAt ?? null,
        lastRejectedAt: null,
        lastRejection: null,
        syncErrors: 0,
        lastSyncAt: now() - 3 * MIN,
        lastSyncSuccessAt: now() - 3 * MIN,
        syncError: null,
      },
      pending: 0,
      recent: recent.slice(0, 25),
    }),
  );

  // --- the channel list, previews, search and metrics -----------------------------------------
  app.get("/api/state", (c) =>
    c.json({
      fetchedAt: now() - 4 * MIN,
      groups: groups.map((g) => ({ id: g.id, name: g.name, rows: g.channels.map((ch) => ({ id: ch.id, name: ch.name, assigned: ch.streams.length })) })),
      providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, maxStreams: p.maxStreams })),
    }),
  );

  app.post("/api/preview", async (c) => {
    const { channelId } = (await c.req.json()) as { channelId: number };
    const ch = channels.find((x) => x.id === channelId);
    if (!ch) return c.json({ error: "unknown channel" }, 404);
    return c.json({
      total: ch.streams.length,
      matched: ch.streams.length,
      currentOrder: ch.streams.map((s, i) => previewRow(s, i + 1)),
    });
  });

  // Every managed channel's streams with their verdicts in one call (Podium with GET /api/verdicts).
  app.get("/api/verdicts", (c) =>
    c.json({
      fetchedAt: now() - 4 * MIN,
      catalogueWrittenAt: now() - 4 * MIN,
      cacheUnavailable: false,
      groups: groups.map((g) => ({ id: g.id, name: g.name })),
      channels: channels.filter((ch) => ch.streams.length).map((ch) => ({ id: ch.id, name: ch.name, groupId: ch.groupId, streams: ch.streams.map((s) => s.id) })),
      streams: streams.map((s) => {
        const { raw, currentRank, ...row } = previewRow(s, 0);
        return { ...row, name: raw, deadStreak: s.status === "dead" ? s.deadStreak : 0 };
      }),
    }),
  );

  // Each stream's recent probes, newest first (Podium 1.18's GET /api/probe-history).
  app.get("/api/probe-history", (c) => {
    const ids = new Set(c.req.queries("stream")?.map(Number) ?? []);
    const since = Number(c.req.query("since") ?? -1);
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json({
      fetchedAt: now(),
      cacheUnavailable: false,
      retention: { maxAgeMs: 30 * 24 * HOUR, perStream: 100 },
      streams: streams
        .filter((s) => ids.size === 0 || ids.has(s.id))
        .map((s) => ({ id: s.id, probes: probeHistoryOf(s, now()).filter((p) => p.probedAt > since).slice(0, limit) }))
        .filter((s) => s.probes.length > 0)
        .sort((a, b) => a.id - b.id),
    });
  });

  app.get("/api/streams", (c) => {
    const q = (c.req.query("q") ?? "").toLowerCase();
    const byName = new Map<string, DemoStream[]>();
    for (const s of streams.filter((s) => s.name.toLowerCase().includes(q))) byName.set(s.normalized, [...(byName.get(s.normalized) ?? []), s]);
    const found = [...byName].map(([normalized, list]) => ({
      normalized,
      count: list.length,
      providers: [...new Set(list.map((s) => s.provider))],
      samples: list.slice(0, 3).map((s) => s.name),
      claimedByChannelIds: channels.filter((ch) => ch.streams.some((s) => list.includes(s))).map((ch) => ch.id),
    }));
    return c.json({ query: q, total: found.length, truncated: false, groups: found });
  });

  app.get("/api/metrics", (c) => c.text(metricsText(groups, now())));

  return app;
}

/** A stream as /api/preview lists it, with the cached probe result (Podium's `last*` fields). */
function previewRow(s: DemoStream, rank: number) {
  const probed = s.probedAt != null;
  const playing = playable(s) || s.status === "black";
  return {
    id: s.id,
    raw: s.name,
    normalized: s.normalized,
    provider: s.provider,
    providerGroup: s.providerGroup,
    currentRank: rank,
    lastProbedAt: s.probedAt,
    lastAlive: probed ? s.status !== "dead" : null,
    lastHeight: probed ? s.height : null,
    lastBitrateKbps: probed ? s.bitrateKbps : null,
    lastBlack: probed ? s.status === "black" : null,
    lastLowBitrate: probed ? s.status === "low_bitrate" : null,
    lastWidth: playing ? s.width : null,
    lastFps: playing ? s.fps : null,
    lastScanType: playing ? "progressive" : null,
    lastVideoCodec: playing ? s.videoCodec : null,
    lastHdrFormat: playing ? s.hdr : null,
    lastAudioCodec: playing ? s.audioCodec : null,
    lastAudioChannels: playing ? s.audioChannels : null,
    lastChannelLayout: playing ? s.layout : null,
    lastAudioBitrateKbps: playing ? s.audioBitrateKbps : null,
    lastAudioSampleRate: playing ? s.sampleRate : null,
    lastSoak: s.soak,
  };
}

/** Connect deliveries over the last couple of weeks, newest first. */
export function connectEvents(groups: DemoGroup[], at: number) {
  const rnd = random(42);
  const withBackups = allChannels(groups).filter((ch) => ch.streams.length > 1 && ch.streams[0].status !== "unprobed");
  const reasons = ["health_monitor", "buffering_timeout", "buffering_timeout", "max_retries_exceeded", "manual"];
  return Array.from({ length: 34 }, (_, i) => {
    const ch = withBackups[Math.floor(rnd() * withBackups.length)];
    const [from, to] = rnd() < 0.7 ? [ch.streams[1], ch.streams[0]] : [ch.streams[0], ch.streams[1]];
    return {
      id: 500 - i,
      event: "stream_switch",
      channelKey: `demo-${ch.id}`,
      channelName: ch.name,
      streamId: to.id,
      previousStreamId: from.id,
      reason: reasons[Math.floor(rnd() * reasons.length)],
      receivedAt: at - Math.floor((i * 9 + rnd() * 8) * HOUR) - 20 * MIN,
      status: 204,
      error: null,
    };
  });
}

/** Podium's per-provider Prometheus series, from the catalogue (the Providers page reads these). */
export function metricsText(groups: DemoGroup[], at: number): string {
  const streams = allStreams(groups);
  const channels = allChannels(groups);
  const lines: string[] = [];
  const series = (name: string, labels: Record<string, string>, value: number) =>
    lines.push(`${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}} ${value}`);
  const bucket = (h: number) => (h >= 2160 ? "uhd" : h >= 1080 ? "fhd" : h >= 720 ? "hd" : h > 0 ? "sd" : "unknown");
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  for (const p of PROVIDERS) {
    const mine = streams.filter((s) => s.provider === p.name);
    const provider = p.name;
    for (const state of ["alive", "dead", "black", "low_bitrate", "unmeasured"] as const) {
      series("podium_provider_streams", { provider, state }, mine.filter((s) => (s.status === "unprobed" ? "unmeasured" : s.status) === state).length);
    }
    const dead = mine.filter((s) => s.status === "dead");
    for (const [reason, match] of [["not_found", "404"], ["timeout", "timed out"], ["server_error", "5XX"], ["probe_error", "Invalid data"]] as const) {
      series("podium_provider_dead_streams", { provider, reason }, dead.filter((s) => s.error?.includes(match)).length);
    }
    for (const r of ["uhd", "fhd", "hd", "sd", "unknown"]) series("podium_provider_resolution_streams", { provider, resolution: r }, mine.filter((s) => bucket(s.height) === r).length);
    const measured = mine.filter((s) => s.bitrateKbps > 0);
    series("podium_provider_bitrate_measured", { provider }, measured.length);
    series("podium_provider_bitrate_kbps", { provider, resolution: "all", stat: "median" }, median(measured.map((s) => s.bitrateKbps)));
    for (const r of ["uhd", "fhd", "hd", "sd"]) {
      const inBucket = measured.filter((s) => bucket(s.height) === r);
      if (inBucket.length) series("podium_provider_bitrate_kbps", { provider, resolution: r, stat: "median" }, median(inBucket.map((s) => s.bitrateKbps)));
    }
    const quality = { "Provider A": 0.82, "Provider B": 0.7, "Provider C": 0.61 }[p.name];
    series("podium_provider_score", { provider, stat: "median" }, quality);
    const ages = mine.filter((s) => s.probedAt).map((s) => (at - s.probedAt!) / 1000);
    series("podium_provider_verdict_age_seconds", { provider, stat: "median" }, Math.round(median(ages)));
    series("podium_provider_verdict_age_seconds", { provider, stat: "max" }, Math.round(Math.max(0, ...ages)));
    series("podium_provider_channels", { provider }, channels.filter((ch) => ch.streams.some((s) => s.provider === p.name)).length);
    const firsts = channels.filter((ch) => ch.streams[0]?.provider === p.name);
    series("podium_provider_rank1_channels", { provider }, firsts.length);
    series("podium_provider_rank1_healthy", { provider }, firsts.filter((ch) => playable(ch.streams[0])).length);
  }
  return lines.join("\n") + "\n";
}
