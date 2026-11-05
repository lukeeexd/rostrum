import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, request } from "./client";

const reply = (body: unknown, init: ResponseInit = {}) =>
  vi.stubGlobal("fetch", vi.fn(async () => (typeof body === "string" ? new Response(body, init) : Response.json(body, init))));

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("parses a JSON 2xx", async () => {
    reply({ status: "ok", worker: "active" });
    expect(await request("/api/health")).toEqual({ status: "ok", worker: "active" });
  });

  it("turns an upstream error into an ApiError carrying its detail", async () => {
    reply({ error: "boom" }, { status: 500 });
    const err = await request("/api/dead").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("/api/dead failed with 500: boom");
  });

  it("explains proxy failures in plain words", async () => {
    reply({ error: "upstream_unreachable" }, { status: 502 });
    await expect(request("/api/stats")).rejects.toThrow("Podium is unreachable from Rostrum.");
  });

  it("refuses an HTML 200 (a misrouted request hitting the SPA fallback)", async () => {
    reply("<!doctype html>", { headers: { "content-type": "text/html" } });
    await expect(request("/api/stats")).rejects.toThrow(/expected JSON/);
  });

  it("reports a network failure as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const err = (await request("/api/health").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
  });

  it("builds the re-check cancel as DELETE ?scope=all", async () => {
    reply({ cancelled: true, scope: "all" });
    await api.cancelRecheckAll();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(["/api/refresh?scope=all", "DELETE"]);
  });
});
