import { describe, expect, it } from "vitest";
import { PROBLEM_KINDS, type ProblemChannel } from "@/api/types";
import { filterChannels, playableText, SECTIONS, UNMEASURED } from "./problems";

const channel = (name: string, group: string | null): ProblemChannel => ({
  id: 1,
  name,
  group,
  groupId: 1,
  streams: 2,
  healthy: 0,
  first: null,
  providers: [],
});

describe("SECTIONS", () => {
  it("covers every problem kind exactly once", () => {
    expect([...SECTIONS.map((s) => s.kind), UNMEASURED.kind].sort()).toEqual([...PROBLEM_KINDS].sort());
  });
});

describe("filterChannels", () => {
  const channels = [channel("Arena Sports Golf", "Sport"), channel("Rovers v United", "Tennis"), channel("Lumen One", null)];

  it("matches the channel or its group, ignoring case", () => {
    expect(filterChannels(channels, "golf").map((c) => c.name)).toEqual(["Arena Sports Golf"]);
    expect(filterChannels(channels, "TENNIS").map((c) => c.name)).toEqual(["Rovers v United"]);
    expect(filterChannels(channels, "  ")).toHaveLength(3);
  });
});

describe("playableText", () => {
  it("reads naturally", () => {
    expect(playableText({ streams: 3, healthy: 1 })).toBe("1 of 3 playable");
    expect(playableText({ streams: 0, healthy: 0 })).toBe("no streams");
  });
});
