import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { parseConfig } from "./config";

// serveStatic wants a root relative to cwd, so the fake build lives in the repo.
const dist = "node_modules/.tmp/app-test-dist";

beforeAll(() => {
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Rostrum</title>");
  writeFileSync(path.join(dist, "assets", "index-abc.js"), "console.log(1)");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const fetch = vi.fn(async () => Response.json({ status: "ok" }));
const app = createApp(
  parseConfig({ PODIUM_URL: "http://192.168.1.10:3456", ROSTRUM_ALLOWED_HOSTS: "rostrum.example.com" }),
  dist,
  fetch as unknown as typeof globalThis.fetch,
);
const get = (p: string, host = "192.168.1.10:8080") => app.request(p, { headers: { host } });

describe("host guard", () => {
  it("answers private hosts and listed ones", async () => {
    expect((await get("/api/health")).status).toBe(200);
    expect((await get("/api/health", "rostrum.example.com")).status).toBe(200);
  });

  it("answers a name given as a URL in ROSTRUM_ALLOWED_HOSTS (a Caddy/Traefik subdomain)", async () => {
    const proxied = createApp(
      parseConfig({ PODIUM_URL: "http://192.168.1.10:3456", ROSTRUM_ALLOWED_HOSTS: "https://rostrum.example.com" }),
      dist,
      fetch as unknown as typeof globalThis.fetch,
    );
    expect((await proxied.request("/api/health", { headers: { host: "rostrum.example.com" } })).status).toBe(200);
  });

  it("says which name it refused", async () => {
    const res = await get("/", "Evil.Example:443");
    expect(await res.json()).toMatchObject({ error: "host_not_allowed", host: "evil.example" });
  });

  it("refuses a rebound public name before anything else runs", async () => {
    fetch.mockClear();
    const res = await get("/api/health", "evil.example");
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect((await get("/", "evil.example")).status).toBe(403);
  });
});

describe("static files", () => {
  it("serves index.html for client routes, uncached, with security headers", async () => {
    for (const route of ["/", "/live", "/dead"]) {
      const res = await get(route);
      expect(res.status, route).toBe(200);
      expect(await res.text()).toContain("<title>Rostrum</title>");
      expect(res.headers.get("cache-control")).toBe("no-cache");
    }
    const res = await get("/");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("caches hashed assets forever", async () => {
    const res = await get("/assets/index-abc.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("404s a missing asset or file instead of returning index.html", async () => {
    expect((await get("/assets/index-OLD.js")).status).toBe(404);
    expect((await get("/robots.txt")).status).toBe(404);
  });

  it("never falls back to HTML for unknown API paths", async () => {
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("answers /healthz", async () => {
    expect(await (await get("/healthz", "127.0.0.1:8080")).json()).toEqual({ ok: true, version: expect.any(String) });
  });
});
