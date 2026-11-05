import { describe, expect, it } from "vitest";
import type { SoakProviderSummary } from "@/api/types";
import { bestByColumn, cleanTone, countWithShare, failingSummary } from "./soak";

const provider = (over: Partial<SoakProviderSummary>): SoakProviderSummary => ({
  name: "P",
  soaks: 10,
  clean: 10,
  dropped: 0,
  unreachable: 0,
  streams: 10,
  medianHeldMs: 180_000,
  drops: 0,
  ...over,
});

describe("cleanTone", () => {
  it("grades the clean share, and is untoned with nothing run", () => {
    expect(cleanTone({ soaks: 0, clean: 0, dropped: 0, unreachable: 0 })).toBeUndefined();
    expect(cleanTone({ soaks: 10, clean: 9, dropped: 1, unreachable: 0 })).toBe("good");
    expect(cleanTone({ soaks: 10, clean: 7, dropped: 0, unreachable: 3 })).toBe("warn");
    expect(cleanTone({ soaks: 10, clean: 6, dropped: 0, unreachable: 4 })).toBe("bad");
  });
});

describe("countWithShare", () => {
  it("shows a share only for a non-zero count", () => {
    const t = { soaks: 4, clean: 3, dropped: 1, unreachable: 0 };
    expect(countWithShare(1, t)).toBe("1 · 25%");
    expect(countWithShare(0, t)).toBe("0");
  });
});

describe("bestByColumn", () => {
  it("marks the best provider per column by share, not raw count, and leaves ties unmarked", () => {
    const providers = [
      provider({ name: "big", soaks: 50, clean: 40, unreachable: 10, medianHeldMs: 180_006 }),
      provider({ name: "small", soaks: 10, clean: 10, medianHeldMs: 180_007 }),
    ];
    const best = bestByColumn(providers);
    expect([...best.get("clean")!]).toEqual([1]);
    expect([...best.get("unreachable")!]).toEqual([1]);
    expect(best.get("held")!.size).toBe(0);
    expect(best.get("soaks")!.size).toBe(0);
  });
});

describe("failingSummary", () => {
  it("reads naturally in the singular and plural", () => {
    expect(failingSummary({ soaks: 1, clean: 0, dropped: 0, unreachable: 1, drops: 0 })).toBe("1 of 1 soak not clean");
    expect(failingSummary({ soaks: 4, clean: 1, dropped: 2, unreachable: 1, drops: 9 })).toBe("3 of 4 soaks not clean · 9 drops");
  });
});
