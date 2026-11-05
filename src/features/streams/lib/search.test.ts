import { describe, expect, it } from "vitest";
import type { StreamSearchResult } from "@/api/types";
import { channelNames, filterResults } from "./search";

const r = (name: string, channelIds: number[]): StreamSearchResult => ({ name, count: 1, providers: [], samples: [], channelIds });

describe("streams search helpers", () => {
  it("keeps only names no channel claims", () => {
    const results = [r("Lumen One", [432]), r("Lumen One Wales", [])];
    expect(filterResults(results, "all")).toHaveLength(2);
    expect(filterResults(results, "unclaimed").map((x) => x.name)).toEqual(["Lumen One Wales"]);
  });

  it("maps channel ids to names across groups", () => {
    const names = channelNames([
      { id: 1, name: "Ent", channels: [{ id: 432, name: "Lumen 1", assigned: 12 }] },
      { id: 2, name: "Sports", channels: [{ id: 7, name: "Arena Sports F1", assigned: 3 }] },
    ]);
    expect([names.get(432), names.get(7), names.get(9)]).toEqual(["Lumen 1", "Arena Sports F1", undefined]);
    expect(channelNames(undefined).size).toBe(0);
  });
});
