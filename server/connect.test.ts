import { describe, expect, it, vi } from "vitest";
import { createConnectEvents, projectConnectEvents } from "./connect";
import type { PodiumClient, PodiumConnectStatus } from "./podium";
import type { StreamIndex } from "./streams-index";

const SECRET = "http://user:SECRET123@cdn.example/live/user/SECRET123/1.ts";

const index: StreamIndex = {
  walkedAt: 0,
  source: "previews",
  channels: [],
  streams: new Map([
    [8135, { streamId: 8135, name: "Arena Sports Golf HD", provider: "Provider A", channelId: 40, channelName: "Arena Sports Golf", lastSoak: null }],
    [7653, { streamId: 7653, name: "Arena Sports Golf FHD", provider: "Provider C", channelId: 40, channelName: "Arena Sports Golf", lastSoak: null }],
  ]),
  channelsByName: new Map([["Arena Sports Golf", 40]]),
};

const status: PodiumConnectStatus = {
  enabled: true,
  state: "listening",
  pending: 0,
  summary: { accepted: 1, rejected: 1, lastReceivedAt: 3000, lastSyncAt: 4000, syncError: `sync failed for ${SECRET}` },
  recent: [
    {
      id: 3,
      event: "channel_error",
      channelName: "Gone Channel",
      streamId: 9999,
      previousStreamId: null,
      reason: "",
      receivedAt: 3000,
      status: 400,
      error: `bad payload from ${SECRET}`,
    },
    { id: 2, event: "stream_switch", channelName: "Arena Sports Golf", streamId: 7653, previousStreamId: 8135, reason: "health_monitor", receivedAt: 2000, status: 204, error: null },
    { id: 1, event: "stream_switch", receivedAt: undefined },
  ],
};

describe("projectConnectEvents", () => {
  it("names both streams and links the channel from the preview walk", () => {
    const { events } = projectConnectEvents(status, index);
    expect(events[1]).toEqual({
      id: 2,
      event: "stream_switch",
      reason: "health_monitor",
      receivedAt: 2000,
      accepted: true,
      error: null,
      channelName: "Arena Sports Golf",
      channelId: 40,
      from: { id: 8135, name: "Arena Sports Golf HD", provider: "Provider A" },
      to: { id: 7653, name: "Arena Sports Golf FHD", provider: "Provider C" },
    });
  });

  it("flags a rejected delivery with its redacted error, and puts an errored stream under `from`", () => {
    const [rejected] = projectConnectEvents(status, index).events;
    expect(rejected).toMatchObject({ accepted: false, channelId: null, from: { id: 9999, name: null, provider: null }, to: null });
    expect(rejected.error).toContain("cdn.example");
    expect(rejected.error).not.toContain("SECRET123");
  });

  it("drops entries without an id or time, and still lists ids when names are unavailable", () => {
    const out = projectConnectEvents(status, null);
    expect(out.events.map((e) => e.id)).toEqual([3, 2]);
    expect(out.named).toBe(false);
    expect(out.events[1].from).toEqual({ id: 8135, name: null, provider: null });
  });

  it("carries the card's status, redacted, with an unknown state shown as an error", () => {
    const out = projectConnectEvents(status, index).status;
    expect(out).toMatchObject({ state: "listening", enabled: true, pending: 0, summary: { accepted: 1, rejected: 1, lastSyncAt: 4000 } });
    expect(out.summary.syncError).not.toContain("SECRET123");
    expect(projectConnectEvents({ state: "weird" }, index).status.state).toBe("error");
  });

  it("reports Connect as off", () => {
    expect(projectConnectEvents({ enabled: false }, index)).toMatchObject({
      status: { state: "disabled", enabled: false, summary: { accepted: 0, lastReceivedAt: null } },
      events: [],
      named: true,
    });
  });
});

describe("createConnectEvents", () => {
  const podium = { connectStatus: vi.fn(async () => status) } as unknown as PodiumClient;

  it("returns the events even when the preview walk fails", async () => {
    const out = await createConnectEvents({ podium, streams: async () => Promise.reject(new Error("walk failed")) }).recent();
    expect(out.named).toBe(false);
    expect(out.events).toHaveLength(2);
  });

  it("answers with ids rather than wait long for a slow walk", async () => {
    const slow = () => new Promise<StreamIndex>((resolve) => setTimeout(() => resolve(index), 1_000));
    const started = Date.now();
    const out = await createConnectEvents({ podium, streams: slow, namesDeadlineMs: 20 }).recent();
    expect(Date.now() - started).toBeLessThan(500);
    expect(out.named).toBe(false);
  });

  it("names the streams when the walk answers in time", async () => {
    const out = await createConnectEvents({ podium, streams: async () => index }).recent();
    expect(out.named).toBe(true);
    expect(out.events[1].from?.name).toBe("Arena Sports Golf HD");
  });
});
