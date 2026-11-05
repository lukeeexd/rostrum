import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { errorText } from "./errors";

describe("errorText", () => {
  it("uses Podium's own reason for a refusal, and Rostrum's explanation otherwise", () => {
    expect(errorText(new ApiError(404, "/api/soak", "every stream on channel 462 was dead at its last probe"))).toBe(
      "every stream on channel 462 was dead at its last probe",
    );
    expect(errorText(new ApiError(502, "/api/soak", "upstream_unreachable"))).toBe("Podium is unreachable from Rostrum.");
    expect(errorText(new ApiError(401, "/api/soak", "nope"))).toBe("Podium refused the token. Check PODIUM_TOKEN.");
    expect(errorText(new Error("boom"))).toBe("boom");
  });
});
