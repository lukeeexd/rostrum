import { describe, expect, it } from "vitest";
import { HEAD_LABEL, HEAD_TONE, headName, placeSegment } from "./history";

describe("headName", () => {
  it("names the stream with its provider, falls back to its id, and says when there is none", () => {
    expect(headName({ streamId: 1, name: "Golf HD", provider: "Provider A", status: "alive" })).toBe("Golf HD · Provider A");
    expect(headName({ streamId: 8135, name: null, provider: null, status: "dead" })).toBe("stream 8135");
    expect(headName({ streamId: null, name: null, provider: null, status: "empty" })).toBe("no streams");
  });
});

describe("HEAD_LABEL and HEAD_TONE", () => {
  it("use the stream vocabulary, with an empty channel neutral", () => {
    expect([HEAD_LABEL("dead"), HEAD_TONE("dead")]).toEqual(["dead", "bad"]);
    expect([HEAD_LABEL("empty"), HEAD_TONE("empty")]).toEqual(["no streams", "neutral"]);
  });
});

describe("placeSegment", () => {
  it("places a segment on the window, clipped to it", () => {
    expect(placeSegment({ from: 25, to: 50 }, 0, 100)).toEqual({ left: 25, width: 25 });
    expect(placeSegment({ from: -10, to: 200 }, 0, 100)).toEqual({ left: 0, width: 100 });
    expect(placeSegment({ from: 0, to: 1 }, 5, 5)).toEqual({ left: 0, width: 0 });
  });
});
