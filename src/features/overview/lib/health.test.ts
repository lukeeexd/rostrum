import { describe, expect, it } from "vitest";
import { healthTone } from "@/lib/tone";
import { connectTone } from "./health";

describe("healthTone", () => {
  it.each([
    [0, 0, "neutral"],
    [9, 10, "good"],
    [85, 123, "bad"],
    [45, 67, "bad"],
    [6, 7, "warn"],
    [34, 49, "bad"],
    [7, 10, "warn"],
  ])("%i of %i → %s", (healthy, total, tone) => expect(healthTone(healthy, total)).toBe(tone));
});

describe("connectTone", () => {
  it("is good only when listening", () => {
    expect(connectTone("listening")).toBe("good");
    expect(connectTone("error")).toBe("bad");
    expect(connectTone("disabled")).toBe("neutral");
  });
});
