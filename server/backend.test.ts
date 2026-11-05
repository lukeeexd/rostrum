import { describe, expect, it, vi } from "vitest";
import previewFixture from "../src/test/fixtures/podium-preview.json";
import stateFixture from "../src/test/fixtures/podium-state.json";
import { createBackend } from "./backend";
import { parseConfig } from "./config";

/** Streams on the captured channel. */
const N = (previewFixture as { currentOrder: unknown[] }).currentOrder.length;

type Reply = (url: URL, init: RequestInit) => Response | Promise<Response>;

function setup(reply: Reply, env: Record<string, string> = {}) {
  const fetch = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => reply(new URL(String(url)), init ?? {}));
  const app = createBackend(
    parseConfig({ PODIUM_URL: "http://192.168.1.10:3456", PODIUM_TOKEN: "tok", ...env }),
    fetch as unknown as typeof globalThis.fetch,
  );
  return { app, fetch, calls: () => fetch.mock.calls.map(([u, i]) => ({ url: new URL(String(u)), init: i! })) };
}

const podiumOk: Reply = (url) =>
  url.pathname === "/api/state" ? Response.json(stateFixture) : Response.json(previewFixture);

describe("/api/rostrum/groups", () => {
  it("reads Podium's cached state, never forcing a refresh, with the token", async () => {
    const { app, calls } = setup(podiumOk);
    const res = await app.request("/api/rostrum/groups");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [{ url, init }] = calls();
    expect(url.href).toBe("http://192.168.1.10:3456/api/state");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    expect((await res.json()).groups.length).toBeGreaterThan(0);
  });
});

describe("/api/rostrum/channels/:id/streams", () => {
  it("asks Podium's preview for exactly that channel, read-only", async () => {
    const { app, calls } = setup(podiumOk);
    const res = await app.request("/api/rostrum/channels/1378/streams");
    expect(res.status).toBe(200);
    const [{ url, init }] = calls();
    expect([url.pathname, url.search, init.method, init.body]).toEqual(["/api/preview", "", "POST", '{"channelId":1378}']);
    expect((await res.json()).streams).toHaveLength(N);
  });

  it("reads Dispatcharr stats with its API key when configured", async () => {
    const { app, calls } = setup(
      (url) => (url.port === "9191" ? Response.json({ url: "http://x/live/u/p/1.ts", stream_stats: { source_fps: 25 } }) : podiumOk(url, {})),
      { DISPATCHARR_URL: "http://192.168.1.10:9191", DISPATCHARR_API_KEY: "dk" },
    );
    const body = await (await app.request("/api/rostrum/channels/1378/streams")).json();
    const d = calls().filter((c) => c.url.port === "9191");
    expect(d).toHaveLength(N);
    expect(d[0].url.pathname).toMatch(/^\/api\/channels\/streams\/\d+\/$/);
    expect(d[0].init.method ?? "GET").toBe("GET");
    expect(new Headers(d[0].init.headers).get("x-api-key")).toBe("dk");
    expect(JSON.stringify(body)).not.toContain("/live/");
    expect(body.streams[0].media.fps).toBe(25);
  });

  it.each(["abc", "0x1", "1.5", "0", "012", "12345678901"])("refuses channel id %s without calling Podium", async (id) => {
    const { app, fetch } = setup(podiumOk);
    expect((await app.request(`/api/rostrum/channels/${id}/streams`)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [() => Response.json({ error: "nope" }, { status: 404 }), 404, "channel_not_found"],
    [() => Response.json({}, { status: 500 }), 502, "upstream_unreachable"],
    [() => Promise.reject(new TypeError("fetch failed")), 502, "upstream_unreachable"],
    [() => Promise.reject(new DOMException("t", "TimeoutError")), 504, "upstream_timeout"],
  ] as const)("maps a Podium failure to %#", async (reply, status, error) => {
    const { app } = setup(reply as Reply);
    const res = await app.request("/api/rostrum/channels/1/streams");
    expect([res.status, (await res.json()).error]).toEqual([status, error]);
  });
});

describe("/api/rostrum/groups errors", () => {
  it("does not call a Podium 404 on /groups a missing channel", async () => {
    const { app } = setup(() => Response.json({}, { status: 404 }));
    const res = await app.request("/api/rostrum/groups");
    expect([res.status, (await res.json()).error]).toEqual([502, "upstream_unreachable"]);
  });

  it("names a refused Podium token", async () => {
    const { app } = setup(() => Response.json({}, { status: 401 }));
    expect((await (await app.request("/api/rostrum/groups")).json()).error).toBe("podium_refused_token");
  });
});

describe("mounting", () => {
  it("answers unknown or non-GET rostrum routes with JSON 404", async () => {
    const { app, fetch } = setup(podiumOk);
    for (const [path, method] of [["/api/rostrum/nope", "GET"], ["/api/rostrum/groups", "POST"]]) {
      const res = await app.request(path, { method });
      expect(res.status, path).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still serves the allowlisted Podium passthrough and refuses the rest", async () => {
    const { app } = setup(() => Response.json({ status: "ok" }));
    expect((await app.request("/api/health")).status).toBe(200);
    expect((await app.request("/api/state")).status).toBe(404);
    expect((await app.request("/api/preview", { method: "POST" })).status).toBe(404);
  });
});

describe("/api/rostrum/streams and /providers", () => {
  it("searches Podium's catalogue with a fixed limit", async () => {
    const { app, calls } = setup(() => Response.json({ total: 0, groups: [] }));
    const res = await app.request("/api/rostrum/streams?q=" + encodeURIComponent("  Northgate News "));
    expect(res.status).toBe(200);
    const [{ url }] = calls();
    expect([url.pathname, url.searchParams.get("q"), url.searchParams.get("limit")]).toEqual(["/api/streams", "Northgate News", "200"]);
  });

  it.each(["", "a", " b ", "x".repeat(101)])("refuses query %j without calling Podium", async (q) => {
    const { app, fetch } = setup(() => Response.json({}));
    expect((await app.request("/api/rostrum/streams?q=" + encodeURIComponent(q))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads /api/metrics as text for the providers page", async () => {
    const { app, calls } = setup((url) =>
      url.pathname === "/api/metrics"
        ? new Response('podium_provider_score{provider="Provider A",stat="median"} 0.5\n', { headers: { "content-type": "text/plain" } })
        : Response.json({ groups: [], providers: [{ name: "Provider A", maxStreams: 3 }] }),
    );
    const body = await (await app.request("/api/rostrum/providers")).json();
    expect(body.providers).toMatchObject([{ name: "Provider A", score: 0.5, maxStreams: 3 }]);
    expect(calls().map((c) => c.url.pathname).sort()).toEqual(["/api/metrics", "/api/state"]);
  });
});

describe("/api/rostrum/connect-events", () => {
  it("reads Podium's Connect status and names the streams from the channel previews", async () => {
    const [first] = (previewFixture as { currentOrder: { id: number; raw: string }[] }).currentOrder;
    const connect = { enabled: true, recent: [{ id: 1, event: "stream_switch", previousStreamId: first.id, streamId: 1, reason: "manual", receivedAt: 5, status: 204 }] };
    const { app, calls } = setup((url) =>
      url.pathname === "/api/connect/status" ? Response.json(connect) : podiumOk(url, {}),
    );
    const res = await app.request("/api/rostrum/connect-events");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.named).toBe(true);
    expect(body.events[0].from).toMatchObject({ id: first.id, name: first.raw });
    expect(calls().every(({ url }) => !url.search.includes("refresh"))).toBe(true);
  });
});

describe("/api/rostrum/channels/:id/history", () => {
  it("refuses a bad channel id or range", async () => {
    const { app } = setup(podiumOk);
    expect((await app.request("/api/rostrum/channels/abc/history")).status).toBe(400);
    expect((await app.request("/api/rostrum/channels/1/history?range=1y")).status).toBe(400);
  });

  it("reports the log as off without a database, defaulting to 7 days", async () => {
    const { app } = setup(podiumOk);
    const body = await (await app.request("/api/rostrum/channels/1378/history")).json();
    expect(body).toMatchObject({ enabled: false, range: "7d", segments: [], soaks: [], connect: [] });
  });
});

describe("/api/rostrum/history", () => {
  it.each(["constructor", "__proto__", "toString", "1y", ""])("refuses range %j", async (range) => {
    const { app } = setup(() => Response.json({}));
    expect((await app.request(`/api/rostrum/history?range=${range}`)).status).toBe(400);
  });

  it("reports history as off, with a reason, when no database is configured", async () => {
    const { app } = setup(() => Response.json({}));
    const body = await (await app.request("/api/rostrum/history?range=24h")).json();
    expect(body).toMatchObject({ enabled: false, range: "24h", points: [] });
    expect(body.reason).toMatch(/HISTORY_DB/);
  });

  it("serves the soak summary from the same database, defaulting to 24 hours, refusing odd ranges", async () => {
    const { app, fetch } = setup(() => Response.json({}));
    const body = await (await app.request("/api/rostrum/soaks")).json();
    expect(body).toMatchObject({ enabled: false, range: "24h", totals: { soaks: 0 }, failing: [], recent: [] });
    expect((await app.request("/api/rostrum/soaks?range=__proto__")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("can be closed (the dev server does this on restart)", () => {
    const { app } = setup(() => Response.json({}));
    expect(() => app.close()).not.toThrow();
  });
});
