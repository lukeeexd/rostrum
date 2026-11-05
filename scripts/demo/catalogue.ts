/**
 * A made-up Dispatcharr catalogue for the demo: fictional channels in a few
 * groups, each carried by some of three made-up providers, with what Podium
 * would have measured. Seeded, so every run (and every screenshot) is the
 * same. Nothing here comes from a real install.
 */

export const PROVIDERS = [
  { id: 1, name: "Provider A", maxStreams: 2, dead: 0.03, black: 0.01, low: 0.02 },
  { id: 2, name: "Provider B", maxStreams: 3, dead: 0.09, black: 0.03, low: 0.04 },
  { id: 3, name: "Provider C", maxStreams: 1, dead: 0.05, black: 0.01, low: 0.12 },
] as const;
export type ProviderName = (typeof PROVIDERS)[number]["name"];

export type DemoStatus = "alive" | "dead" | "black" | "low_bitrate" | "unprobed";

export interface DemoSoak {
  completedAt: number;
  heldMs: number;
  drops: number;
  failedDials: number;
  unreachable: boolean;
}

export interface DemoStream {
  id: number;
  name: string;
  normalized: string;
  provider: ProviderName;
  providerGroup: string;
  status: DemoStatus;
  probedAt: number | null;
  height: number;
  width: number;
  fps: number;
  bitrateKbps: number;
  videoCodec: string;
  hdr: string;
  audioCodec: string;
  audioChannels: number;
  layout: string;
  audioBitrateKbps: number;
  sampleRate: number;
  soak: DemoSoak | null;
  deadStreak: number;
  error: string | null;
}

export interface DemoChannel {
  id: number;
  name: string;
  groupId: number;
  /** In Dispatcharr's order: the first is served first. */
  streams: DemoStream[];
}

export interface DemoGroup {
  id: number;
  name: string;
  channels: DemoChannel[];
}

/** Small, fast, seeded PRNG (mulberry32), so the demo is the same every run. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUPS: { name: string; channels: string[]; events?: boolean }[] = [
  { name: "News", channels: ["Northgate News", "City 24", "World Report", "Business Line", "Weather Now", "Parliament Live"] },
  { name: "Sports", channels: ["Arena Sports 1", "Arena Sports 2", "Arena Sports 3", "Fairway TV", "Baseline Tennis", "Motor Live", "Fight Night"] },
  { name: "Entertainment", channels: ["Lumen One", "Lumen Two", "Harbour TV", "Comedy Corner", "Drama House", "Real Lives", "Quiz Night"] },
  { name: "Movies", channels: ["Picture House", "Picture House Action", "Silver Screen", "Classic Reels", "Family Films"] },
  { name: "Documentary", channels: ["Planet Wild", "History Hour", "Science Lab", "Ocean Deep"] },
  { name: "Kids", channels: ["Junior Zone", "Little Ones", "Cartoon Lane"] },
  { name: "Music", channels: ["Hits 24", "Rock Stage", "Chill Beats"] },
  {
    name: "Events | Football",
    channels: ["Cup | Rovers v United", "Cup | Athletic v City", "League | Town v Wanderers", "League | Harbour v Rangers", "Friendly | North v South"],
    events: true,
  },
];

const QUALITIES = [
  { tag: "FHD", height: 1080, width: 1920, kbps: 6500 },
  { tag: "HD", height: 720, width: 1280, kbps: 3800 },
  { tag: "UHD", height: 2160, width: 3840, kbps: 15000 },
  { tag: "SD", height: 576, width: 1024, kbps: 1600 },
  { tag: "HD 50fps", height: 1080, width: 1920, kbps: 7200 },
];

const PROVIDER_GROUPS: Record<ProviderName, string[]> = {
  "Provider A": ["General", "Sport", "Cinema"],
  "Provider B": ["Entertainment", "Sports", "Movies"],
  "Provider C": ["All Channels"],
};

const ERRORS = ["Server returned 404 Not Found", "Connection timed out", "Server returned 5XX Server Error reply", "Invalid data found when processing input"];

const HOUR = 3600_000;

/** The catalogue as of `now`. */
export function buildCatalogue(now: number): DemoGroup[] {
  const rnd = random(20261105);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  let streamId = 10_000;
  let channelId = 400;

  const stream = (channel: string, provider: (typeof PROVIDERS)[number], measured: boolean): DemoStream => {
    const q = pick(QUALITIES);
    const roll = rnd();
    const status: DemoStatus = !measured
      ? "unprobed"
      : roll < provider.dead
        ? "dead"
        : roll < provider.dead + provider.black
          ? "black"
          : roll < provider.dead + provider.black + provider.low
            ? "low_bitrate"
            : "alive";
    const playable = status === "alive" || status === "low_bitrate";
    const soaked = measured && rnd() < 0.45;
    const soakRoll = rnd();
    return {
      id: ++streamId,
      name: `${channel} ${q.tag}`,
      normalized: channel,
      provider: provider.name,
      providerGroup: pick(PROVIDER_GROUPS[provider.name]),
      status,
      probedAt: measured ? now - Math.floor(rnd() * 20 * HOUR) - 5 * 60_000 : null,
      height: playable || status === "black" ? q.height : 0,
      width: playable || status === "black" ? q.width : 0,
      fps: q.tag.includes("50fps") || rnd() < 0.3 ? 50 : 25,
      bitrateKbps: status === "low_bitrate" ? 350 + Math.floor(rnd() * 120) : playable ? Math.round(q.kbps * (0.75 + rnd() * 0.5)) : 0,
      videoCodec: q.height >= 2160 || rnd() < 0.15 ? "hevc" : "h264",
      hdr: q.height >= 2160 && rnd() < 0.6 ? "HDR10" : "SDR",
      audioCodec: rnd() < 0.3 ? "eac3" : "aac",
      audioChannels: rnd() < 0.3 ? 6 : 2,
      layout: rnd() < 0.3 ? "5.1" : "stereo",
      audioBitrateKbps: rnd() < 0.3 ? 384 : 128,
      sampleRate: 48000,
      soak: soaked
        ? {
            completedAt: now - Math.floor((6 + rnd() * 4) * HOUR),
            heldMs: soakRoll < 0.08 ? 1000 : soakRoll < 0.14 ? 60_000 + Math.floor(rnd() * 100_000) : 180_000,
            drops: soakRoll >= 0.08 && soakRoll < 0.14 ? 1 + Math.floor(rnd() * 6) : 0,
            failedDials: soakRoll < 0.08 ? 3 : 0,
            unreachable: soakRoll < 0.08,
          }
        : null,
      deadStreak: status === "dead" ? 1 + Math.floor(rnd() * 8) : 0,
      error: status === "dead" ? pick(ERRORS) : null,
    };
  };

  const rank = (s: DemoStream) =>
    ({ alive: 0, low_bitrate: 1, black: 2, unprobed: 3, dead: 4 })[s.status] * 10_000 - (s.bitrateKbps > 0 ? Math.min(s.height, 1080) : 0);

  return GROUPS.map((g, gi) => ({
    id: 100 + gi,
    name: g.name,
    channels: g.channels.map((name, ci) => {
      const id = ++channelId;
      // Events channels: two not measured yet, one with nothing matched, the rest measured but all dead.
      if (g.events) {
        if (ci === 2) return { id, name, groupId: 100 + gi, streams: [] };
        const measured = ci > 2;
        const streams = PROVIDERS.slice(0, 2).map((p) => stream(name, p, measured));
        if (measured) for (const s of streams) Object.assign(s, { status: "dead", height: 0, width: 0, bitrateKbps: 0, error: pick(ERRORS), deadStreak: 2 });
        return { id, name, groupId: 100 + gi, streams };
      }
      // One channel carried by one provider only.
      const providers = name === "Ocean Deep" ? [PROVIDERS[2], PROVIDERS[2]] : PROVIDERS.filter(() => rnd() < 0.85);
      const streams = (providers.length ? providers : [PROVIDERS[0]]).flatMap((p) => (rnd() < 0.4 ? [stream(name, p, true), stream(name, p, true)] : [stream(name, p, true)]));
      streams.sort((a, b) => rank(a) - rank(b));
      // One channel still serving a dead stream first, a playable one behind it (Podium reorders on its next pass).
      if (name === "Motor Live" && streams.length > 1) {
        Object.assign(streams[0], { status: "dead", height: 0, width: 0, bitrateKbps: 0, error: ERRORS[0], deadStreak: 1 });
      }
      return { id, name, groupId: 100 + gi, streams };
    }),
  }));
}

export const allChannels = (groups: DemoGroup[]) => groups.flatMap((g) => g.channels);
export const allStreams = (groups: DemoGroup[]) => {
  const seen = new Map<number, DemoStream>();
  for (const c of allChannels(groups)) for (const s of c.streams) seen.set(s.id, s);
  return [...seen.values()];
};
export const playable = (s: DemoStream) => s.status === "alive" || s.status === "low_bitrate";
