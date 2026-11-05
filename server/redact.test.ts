import { describe, expect, it } from "vitest";
import { redactUrls } from "./redact";

describe("redactUrls", () => {
  it("keeps only the host of a provider URL, dropping credential-bearing paths", () => {
    expect(
      redactUrls("https://provider.example/live/USER/PASS/1234.ts: Server returned 404 Not Found"),
    ).toBe("provider.example: Server returned 404 Not Found");
  });

  it("drops userinfo and query strings too", () => {
    expect(redactUrls("open http://user:pass@cdn.example:8080/a?token=x failed")).toBe("open cdn.example:8080 failed");
  });

  it("leaves text without URLs alone", () => {
    expect(redactUrls("timeout")).toBe("timeout");
    expect(redactUrls("UK: ARENA SPORTS 6 ᴴᴰ, 1080p @ 50fps, ratio 16:9")).toBe("UK: ARENA SPORTS 6 ᴴᴰ, 1080p @ 50fps, ratio 16:9");
    expect(redactUrls("match 76ers vs. Pistons (11.04 07:12 PM ET)")).toBe("match 76ers vs. Pistons (11.04 07:12 PM ET)");
  });

  it.each([
    ["failed for user1:s3cret@cdn.example/x", "failed for cdn.example/x"],
    ["GET /get.php?username=u1&password=p2&type=m3u", "GET /get.php?username=[redacted]&password=[redacted]&type=m3u"],
    ["cdn.example/live/u1/p2/9001.ts not found", "cdn.example/live/[redacted]/9001.ts not found"],
    ["key=abc123 rejected", "key=abc123 rejected"],
    ["?token=abc&x=1", "?token=[redacted]&x=1"],
  ])("masks scheme-less credentials: %s", (input, out) => {
    expect(redactUrls(input)).toBe(out);
  });
});
