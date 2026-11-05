import type { ConnectEvent, ProvidersResponse, SoakRecord } from "../../src/api/types";
import { soakVerdict } from "../../src/lib/soak";
import { openHistoryStore, SAMPLE_EVERY_MS, toSnapshot } from "../../server/history";
import { problemCounts } from "../../server/problems";
import type { StreamIndex } from "../../server/streams-index";
import { allChannels, allStreams, playable, PROVIDERS, random, type DemoGroup } from "./catalogue";
import { connectEvents } from "./podium";

/**
 * A week of history for the demo, written through Rostrum's own store: a
 * snapshot every 5 minutes (with a daily rhythm and a bad evening or two), a
 * soak sweep each night, the Connect deliveries, and each channel's slot 1
 * with the odd outage. Rostrum's own sampler carries on from there.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** The walk Rostrum would make of the catalogue: every channel's streams in order, and every stream once. */
export function indexOf(groups: DemoGroup[], at: number): StreamIndex {
  const index: StreamIndex = { walkedAt: at, streams: new Map(), channels: [], channelsByName: new Map() };
  for (const g of groups) {
    for (const ch of g.channels) {
      index.channelsByName.set(ch.name, ch.id);
      index.channels.push({ id: ch.id, name: ch.name, group: g.name, groupId: g.id, streams: ch.streams.map((s) => ({ streamId: s.id, status: s.status })) });
      for (const s of ch.streams) {
        if (!index.streams.has(s.id)) {
          index.streams.set(s.id, { streamId: s.id, name: s.name, provider: s.provider, channelId: ch.id, channelName: ch.name, lastSoak: s.soak });
        }
      }
    }
  }
  return index;
}

export function seedHistory(file: string, groups: DemoGroup[], now: number) {
  const store = openHistoryStore(file);
  const streams = allStreams(groups);
  const channels = allChannels(groups);
  const rnd = random(7);
  const base = indexOf(groups, now);
  const counts = problemCounts(base);
  const states = { alive: 0, dead: 0, black: 0, low_bitrate: 0, unmeasured: 0 };
  for (const s of streams) states[s.status === "unprobed" ? "unmeasured" : s.status]++;
  const served = channels.filter((c) => c.streams.length);

  // Snapshots: a gentle daily rhythm, plus two bad evenings for Provider B.
  for (let t = now - WEEK; t < now; t += SAMPLE_EVERY_MS) {
    const hourOfDay = new Date(t).getHours();
    const daysAgo = Math.floor((now - t) / DAY);
    const badEvening = (daysAgo === 2 || daysAgo === 5) && hourOfDay >= 18 && hourOfDay <= 22;
    const wobble = Math.sin((t / DAY) * 2 * Math.PI) * 2 + (rnd() - 0.5) * 2;
    const dead = Math.max(0, Math.round(states.dead + wobble + (badEvening ? 9 : 0)));
    const black = Math.max(0, Math.round(states.black + (rnd() < 0.2 ? 1 : 0)));
    const low = Math.max(0, Math.round(states.low_bitrate + wobble / 2));
    const total = streams.length;
    const healthyFirst = served.filter((c) => playable(c.streams[0])).length - (badEvening ? 5 : 0) - (rnd() < 0.3 ? 1 : 0);
    const stats = {
      streams: { total, states: { alive: total - dead - black - low - states.unmeasured, dead, black, low_bitrate: low, unmeasured: states.unmeasured } },
      primary: { total: served.length, healthy: healthyFirst },
      freshness: { oldestProbeAgeSeconds: 14 * 3600 + (hourOfDay % 12) * 900 + rnd() * 1800, targetSeconds: 24 * 3600 },
    };
    const providers = {
      providers: PROVIDERS.map((p, i) => {
        const firsts = served.filter((c) => c.streams[0].provider === p.name);
        const sag = p.name === "Provider B" && badEvening ? 4 : 0;
        return {
          name: p.name,
          rank1Channels: firsts.length,
          rank1Healthy: Math.max(0, firsts.filter((c) => playable(c.streams[0])).length - sag),
          score: [0.82, 0.7, 0.61][i] + (rnd() - 0.5) * 0.04 - (sag ? 0.08 : 0),
          bitrateKbps: { all: [6200, 4800, 3100][i] * (0.95 + rnd() * 0.1) },
        };
      }),
    } as unknown as ProvidersResponse;
    const problems = {
      ...counts,
      noHealthy: counts.noHealthy + (badEvening ? 2 : 0),
      badFirst: counts.badFirst + (badEvening ? 3 : rnd() < 0.15 ? 1 : 0),
    };
    store.add(toSnapshot(t, stats, providers, problems));
  }

  // A soak sweep each night between 02:00 and 05:00, about forty streams at a time.
  const soakable = streams.filter((s) => s.status !== "unprobed");
  for (let night = 6; night >= 1; night--) {
    const start = new Date(now - night * DAY);
    start.setHours(2, 0, 0, 0);
    const records: SoakRecord[] = soakable
      .filter(() => rnd() < 0.4)
      .map((s, i) => {
        const roll = rnd();
        const weak = s.provider === "Provider B" ? 0.1 : 0.03;
        const unreachable = s.status === "dead" || roll < weak;
        const dropped = !unreachable && roll < weak * 2.2;
        const result = {
          completedAt: start.getTime() + i * 4 * 60_000 + Math.floor(rnd() * 60_000),
          heldMs: unreachable ? 1000 : dropped ? 40_000 + Math.floor(rnd() * 120_000) : 180_000,
          drops: dropped ? 1 + Math.floor(rnd() * 5) : 0,
          failedDials: unreachable ? 3 : 0,
          unreachable,
        };
        const ch = channels.find((c) => c.streams.includes(s))!;
        return { streamId: s.id, name: s.name, provider: s.provider, channelId: ch.id, channelName: ch.name, ...result, verdict: soakVerdict(result) };
      });
    store.soaks.add(records);
  }
  // Last night's results are what Podium reports now (each stream's latest soak).
  store.soaks.add(
    streams.flatMap((s) => {
      if (!s.soak) return [];
      const ch = channels.find((c) => c.streams.includes(s))!;
      return [{ streamId: s.id, name: s.name, provider: s.provider, channelId: ch.id, channelName: ch.name, ...s.soak, verdict: soakVerdict(s.soak) }];
    }),
  );

  // Connect deliveries, named the way Rostrum names them.
  const named = (id: number | null) => {
    const s = id == null ? undefined : base.streams.get(id);
    return id == null ? null : { id, name: s?.name ?? null, provider: s?.provider ?? null };
  };
  const events: ConnectEvent[] = connectEvents(groups, now).map((e) => ({
    id: e.id,
    event: e.event,
    reason: e.reason,
    receivedAt: e.receivedAt,
    accepted: true,
    error: null,
    channelName: e.channelName,
    channelId: base.channelsByName.get(e.channelName) ?? null,
    from: named(e.previousStreamId),
    to: named(e.streamId),
  }));
  store.connect.add(events);

  // Each channel's slot 1 every half hour: mostly steady, with short outages and backup swaps.
  for (let t = now - WEEK; t < now; t += 30 * 60_000) {
    const index = indexOf(groups, t);
    for (const ch of index.channels) {
      if (ch.streams.length < 2) continue;
      const r = random(ch.id * 1000 + Math.floor(t / (6 * HOUR)))();
      if (r < 0.06) ch.streams = [{ ...ch.streams[0], status: "dead" }, ...ch.streams.slice(1)];
      else if (r < 0.12) ch.streams = [ch.streams[1], ch.streams[0], ...ch.streams.slice(2)];
    }
    store.heads.add(index);
  }

  store.close();
}
