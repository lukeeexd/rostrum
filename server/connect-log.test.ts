import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ConnectEvent } from "../src/api/types";
import { openConnectTable } from "./connect-log";
import { countsAgainst, summariseConnect } from "./connect-summary";
import { createHistory } from "./history";

const event = (over: Partial<ConnectEvent>): ConnectEvent => ({
  id: 1,
  event: "stream_switch",
  reason: "buffering_timeout",
  receivedAt: 1000,
  accepted: true,
  error: null,
  channelName: "Arena Sports Golf",
  channelId: 40,
  from: { id: 8135, name: "Golf HD", provider: "Provider B" },
  to: { id: 7653, name: "Golf FHD", provider: "Provider A" },
  ...over,
});

describe("openConnectTable", () => {
  it("logs each delivery once, fills in names learned later, and returns newest first", () => {
    const table = openConnectTable(new DatabaseSync(":memory:"));
    table.add([event({ from: { id: 8135, name: null, provider: null }, channelId: null })]);
    table.add([event({}), event({ id: 2, receivedAt: 2000 })]);
    const rows = table.between(0, 5000);
    expect(rows.map((e) => e.id)).toEqual([2, 1]);
    expect(rows[1]).toMatchObject({ channelId: 40, from: { name: "Golf HD", provider: "Provider B" } });
    expect(table.since()).toBe(1000);
    expect(table.pruneBefore(1500)).toBe(1);
  });

  it("keeps a name it already has rather than overwrite it", () => {
    const table = openConnectTable(new DatabaseSync(":memory:"));
    table.add([event({})]);
    table.add([event({ from: { id: 8135, name: "Renamed", provider: "Provider B" } })]);
    expect(table.between(0, 5000)[0].from?.name).toBe("Golf HD");
  });
});

describe("countsAgainst", () => {
  it("counts switches Dispatcharr made and channel errors Podium accepted", () => {
    expect(countsAgainst(event({}))).toBe(true);
    expect(countsAgainst(event({ reason: "manual" }))).toBe(false);
    expect(countsAgainst(event({ accepted: false }))).toBe(false);
    expect(countsAgainst(event({ event: "channel_error", reason: "manual" }))).toBe(true);
  });
});

describe("summariseConnect", () => {
  const events = [
    event({ id: 5, receivedAt: 5000 }),
    event({ id: 4, receivedAt: 4000, reason: "manual" }),
    event({ id: 3, receivedAt: 3000, channelName: "Northgate News", channelId: 1, from: { id: 1, name: "Northgate", provider: "Provider A" }, to: { id: 2, name: "Northgate B", provider: "Provider C" } }),
    event({ id: 2, receivedAt: 2000, accepted: false }),
    event({ id: 1, receivedAt: 1000 }),
  ];
  const out = summariseConnect(events);

  it("ranks the streams and channels switched from most, leaving out manual and rejected ones", () => {
    expect([out.total, out.counted]).toEqual([5, 3]);
    expect(out.streams.map((s) => [s.id, s.switches, s.lastAt])).toEqual([
      [8135, 2, 5000],
      [1, 1, 3000],
    ]);
    expect(out.channels.map((c) => [c.name, c.switches])).toEqual([
      ["Arena Sports Golf", 2],
      ["Northgate News", 1],
    ]);
  });

  it("counts each provider's streams switched from and to", () => {
    expect(out.providers).toEqual([
      { name: "Provider B", from: 2, to: 0 },
      { name: "Provider A", from: 1, to: 2 },
      { name: "Provider C", from: 0, to: 1 },
    ]);
  });

  it("names a stream from an older event when the newest was logged without a name", () => {
    const unnamedFirst = summariseConnect([event({ id: 9, receivedAt: 9000, from: { id: 8135, name: null, provider: null } }), event({})]);
    expect(unnamedFirst.streams[0]).toMatchObject({ id: 8135, name: "Golf HD", provider: "Provider B", switches: 2, lastAt: 9000 });
  });

  it("returns every event in range, manual and rejected included", () => {
    expect(out.events.map((e) => e.id)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("createHistory Connect log", () => {
  it("logs Podium's latest events on each sample and serves the rankings", async () => {
    const receivedAt = Date.now() - 60_000; // Podium reports the same delivery the same way on every tick
    const h = createHistory({
      file: ":memory:",
      stats: async () => ({}),
      providers: async () => ({ providers: [] }),
      soaks: async () => [],
      connectEvents: async () => [event({ receivedAt })],
    });
    await h.sample();
    await h.sample();
    expect(h.readConnect("24h")).toMatchObject({ enabled: true, total: 1, counted: 1, streams: [{ id: 8135, switches: 1 }] });
    h.close();
  });

  it("reports the log as off without a database", () => {
    const h = createHistory({ file: undefined, stats: async () => ({}), providers: async () => ({ providers: [] }), soaks: async () => [], connectEvents: async () => [] });
    expect(h.readConnect("7d")).toMatchObject({ enabled: false, total: 0, events: [] });
  });
});
