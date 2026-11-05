import type { ConnectEvent, ConnectLogResponse, SwitchedChannel, SwitchedStream, SwitchProvider } from "../src/api/types";

/**
 * What the Connect log adds up to: which streams, channels and providers the
 * switches fall on. Pure, so the browser tests can build realistic responses.
 */

/** Most events returned for a range; the rankings use them all. */
export const CONNECT_LOG_LIMIT = 200;
const RANKING_LIMIT = 50;

/** Counts in the rankings: a delivery Podium took in, for a switch Dispatcharr made itself or a channel error. */
export const countsAgainst = (e: ConnectEvent) => e.accepted && (e.event === "channel_error" || e.reason !== "manual");

/** The rankings and the latest events, from the events in range (newest first). */
export function summariseConnect(events: ConnectEvent[]): Pick<ConnectLogResponse, "total" | "counted" | "events" | "streams" | "channels" | "providers"> {
  const streams = new Map<number, SwitchedStream>();
  const channels = new Map<string, SwitchedChannel>();
  const providers = new Map<string, SwitchProvider>();
  const provider = (name: string) => {
    let p = providers.get(name);
    if (!p) providers.set(name, (p = { name, from: 0, to: 0 }));
    return p;
  };
  let counted = 0;

  for (const e of events) {
    if (!countsAgainst(e)) continue;
    counted++;
    if (e.from) {
      // Newest first, so the first sighting carries the latest names and time.
      let s = streams.get(e.from.id);
      if (!s) {
        const { id, name, provider } = e.from;
        streams.set(id, (s = { id, name, provider, channelName: e.channelName, channelId: e.channelId, switches: 0, lastAt: e.receivedAt }));
      }
      s.switches++;
      // The newest row may have been logged before the stream could be named; an older one may know it.
      s.name ??= e.from.name;
      s.provider ??= e.from.provider;
      if (e.from.provider) provider(e.from.provider).from++;
    }
    if (e.to?.provider) provider(e.to.provider).to++;
    if (e.channelName) {
      let c = channels.get(e.channelName);
      if (!c) channels.set(e.channelName, (c = { name: e.channelName, channelId: e.channelId, switches: 0, lastAt: e.receivedAt }));
      c.switches++;
    }
  }

  const ranked = <T extends { switches: number; lastAt: number }>(m: Map<unknown, T>) =>
    [...m.values()].sort((a, b) => b.switches - a.switches || b.lastAt - a.lastAt).slice(0, RANKING_LIMIT);
  return {
    total: events.length,
    counted,
    events: events.slice(0, CONNECT_LOG_LIMIT),
    streams: ranked(streams),
    channels: ranked(channels),
    providers: [...providers.values()].sort((a, b) => b.from - a.from || b.to - a.to || a.name.localeCompare(b.name)),
  };
}
