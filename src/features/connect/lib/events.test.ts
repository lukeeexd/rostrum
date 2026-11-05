import { describe, expect, it } from "vitest";
import { eventChip, streamLabel } from "./events";

describe("eventChip", () => {
  it.each([
    [{ event: "stream_switch", reason: "health_monitor" }, "Health monitor", "warn"],
    [{ event: "stream_switch", reason: "buffering_timeout" }, "Buffering timeout", "warn"],
    [{ event: "stream_switch", reason: "max_retries_exceeded" }, "Max retries", "warn"],
    [{ event: "stream_switch", reason: "manual" }, "Changed by hand", "neutral"],
    [{ event: "stream_switch", reason: "something_new" }, "something_new", "warn"],
    [{ event: "stream_switch", reason: "" }, "Switched", "warn"],
    [{ event: "channel_error", reason: "" }, "Channel error", "bad"],
    [{ event: "channel_error", reason: "upstream_eof" }, "Channel error · upstream_eof", "bad"],
  ])("%o → %s", (e, label, tone) => expect(eventChip(e)).toEqual({ label, tone }));
});

describe("streamLabel", () => {
  it("names a known stream with its provider, and falls back to the id", () => {
    expect(streamLabel({ id: 1, name: "Arena Sports Golf HD", provider: "Provider A" })).toBe("Arena Sports Golf HD · Provider A");
    expect(streamLabel({ id: 1, name: "Arena Sports Golf HD", provider: null })).toBe("Arena Sports Golf HD");
    expect(streamLabel({ id: 8135, name: null, provider: null })).toBe("stream 8135");
  });
});
