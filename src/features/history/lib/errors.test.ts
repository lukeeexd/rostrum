import { describe, expect, it } from "vitest";
import { describeRunError } from "./errors";

describe("describeRunError", () => {
  it.each([
    ["Could not reach Dispatcharr: connect ECONNREFUSED", "Could not reach Dispatcharr"],
    ["TypeError: fetch failed", "Could not reach Dispatcharr"],
    ["Dispatcharr returned 401", "Dispatcharr refused the credentials"],
    ["HTTP 403 Forbidden", "Dispatcharr refused the credentials"],
    ["Dispatcharr refused the credentials", "Dispatcharr refused the credentials"],
  ])("%s → %s", (raw, out) => expect(describeRunError(raw)).toBe(out));

  it("does not mistake a port or id containing 401/403 for an auth failure", () => {
    expect(describeRunError("probe of cdn.lan:4030 timed out")).toBe("probe of cdn.lan:4030 timed out");
    expect(describeRunError("stream 14011 vanished")).toBe("stream 14011 vanished");
  });

  it("truncates unknown long errors", () => {
    const out = describeRunError("x".repeat(80));
    expect(out).toHaveLength(61);
    expect(out.endsWith("…")).toBe(true);
  });
});
