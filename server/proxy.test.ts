import { describe, expect, it, vi } from "vitest";
import { createProxy } from "./proxy";

const upstream = new URL("http://192.168.1.10:3456");

function setup(token?: string, reply: () => Response | Promise<Response> = () => Response.json({ ok: 1 })) {
  const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => reply());
  const app = createProxy({ upstream, token, fetch: fetch as unknown as typeof globalThis.fetch });
  const sent = () => {
    const [url, init] = fetch.mock.calls[0];
    return { url: String(url), init: init!, headers: new Headers(init!.headers) };
  };
  return { app, fetch, sent };
}

const browserHeaders = {
  host: "rostrum.lan:8080",
  origin: "http://rostrum.lan:8080",
  "sec-fetch-site": "same-origin",
  cookie: "podium_token=leak",
  referer: "http://rostrum.lan:8080/live",
  authorization: "Bearer from-browser",
};

describe("reads", () => {
  it.each(["/api/health", "/api/stats", "/api/progress", "/api/dead", "/api/soak"])(
    "forwards GET %s to Podium",
    async (path) => {
      const { app, sent } = setup();
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(sent().url).toBe(`http://192.168.1.10:3456${path}`);
      expect(sent().init.method).toBe("GET");
    },
  );

  it("drops browser headers and never forwards the client's Authorization", async () => {
    const { app, sent } = setup();
    await app.request("/api/stats", { headers: browserHeaders });
    const h = sent().headers;
    for (const name of ["origin", "sec-fetch-site", "cookie", "referer", "host", "authorization"]) {
      expect(h.has(name), name).toBe(false);
    }
    expect(h.get("accept")).toBe("application/json");
  });

  it("injects the configured token", async () => {
    const { app, sent } = setup("s3cret");
    await app.request("/api/stats", { headers: browserHeaders });
    expect(sent().headers.get("authorization")).toBe("Bearer s3cret");
  });

  it("drops query strings on reads", async () => {
    const { app, sent } = setup();
    await app.request("/api/progress?refresh=1&x=y");
    expect(sent().url).toBe("http://192.168.1.10:3456/api/progress");
  });

  it("passes status and content-type through, but no other upstream headers", async () => {
    const { app } = setup(undefined, () =>
      new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json", "set-cookie": "a=b", location: "/x" },
      }),
    );
    const res = await app.request("/api/stats");
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("redaction", () => {
  it("cuts provider URLs to their host in every JSON string before they leave the server", async () => {
    const { app } = setup(undefined, () =>
      Response.json({
        entries: [{ error: "https://p.example/live/USER/PASS/1.ts: Server returned 404 Not Found", name: "Lumen One HD" }],
        progress: { message: "probing http://q.example:8080/x/USER/PASS", lanes: [{ current: ["Lumen"] }] },
      }),
    );
    const text = await (await app.request("/api/dead")).text();
    expect(text).not.toMatch(/USER|PASS/);
    expect(JSON.parse(text)).toEqual({
      entries: [{ error: "p.example: Server returned 404 Not Found", name: "Lumen One HD" }],
      progress: { message: "probing q.example:8080", lanes: [{ current: ["Lumen"] }] },
    });
  });

  it("redacts plain-text error bodies too", async () => {
    const { app } = setup(undefined, () =>
      new Response("boom at http://p.example/live/USER/PASS/1.ts", { status: 500, headers: { "content-type": "text/plain" } }),
    );
    const res = await app.request("/api/stats");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("boom at p.example");
  });
});

describe("allowlist", () => {
  it.each(["/api/settings", "/api/backup", "/api/apply/12", "/api/state", "/api/connect/status", "/api/../api/backup"])(
    "refuses %s without calling Podium",
    async (path) => {
      const { app, fetch } = setup();
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("refuses writes to read endpoints", async () => {
    const { app, fetch } = setup();
    const res = await app.request("/api/stats", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets GET /api/refresh list the current marks, without its query", async () => {
    const { app, sent } = setup();
    expect((await app.request("/api/refresh?scope=all")).status).toBe(200);
    expect(sent().url).toBe("http://192.168.1.10:3456/api/refresh");
    expect(sent().init.method).toBe("GET");
  });

  it("refuses PUT on /api/refresh", async () => {
    const { app, fetch } = setup();
    const res = await app.request("/api/refresh", { method: "PUT" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD, POST, DELETE");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("re-check writes", () => {
  const post = (body: string, headers: Record<string, string> = {}) => ({
    method: "POST",
    body,
    headers: { "content-type": "application/json", host: "rostrum.lan:8080", ...headers },
  });

  it("forwards a whole-catalogue queue as a clean request", async () => {
    const { app, sent } = setup("tok");
    const res = await app.request(
      "/api/refresh",
      post('{"scope":"all"}', { origin: "http://rostrum.lan:8080", "sec-fetch-site": "same-origin" }),
    );
    expect(res.status).toBe(200);
    const { url, init, headers } = sent();
    expect(url).toBe("http://192.168.1.10:3456/api/refresh");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"scope":"all"}');
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.has("origin")).toBe(false);
    expect(headers.has("sec-fetch-site")).toBe(false);
  });

  it("forwards a single-group queue, rebuilt from the parsed body", async () => {
    const { app, sent } = setup();
    const res = await app.request("/api/refresh", post('{ "groupId": 643, "scope": "group" }'));
    expect(res.status).toBe(200);
    expect(sent().init.body).toBe('{"scope":"group","groupId":643}');
  });

  it.each([
    ['{"scope":"group"}'],
    ['{"scope":"group","groupId":"3"}'],
    ['{"scope":"group","groupId":0}'],
    ['{"scope":"group","groupId":-4}'],
    ['{"scope":"group","groupId":1.5}'],
    ['{"scope":"group","groupId":3,"extra":1}'],
    ['{"scope":"all","groupId":3}'],
    ['{"scope":"all","extra":1}'],
    ["not json"],
    ['["all"]'],
  ])("refuses body %s", async (body) => {
    const { app, fetch } = setup();
    expect((await app.request("/api/refresh", post(body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a non-JSON content type (a cross-site form post)", async () => {
    const { app, fetch } = setup();
    const res = await app.request("/api/refresh", post('{"scope":"all"}', { "content-type": "text/plain" }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site" }],
    [{ origin: "http://evil.example" }],
    [{ origin: "null" }],
  ])("refuses a cross-site write %o", async (headers) => {
    const { app, fetch } = setup();
    expect((await app.request("/api/refresh", post('{"scope":"all"}', headers))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a cancel with only scope=all", async () => {
    const { app, sent } = setup();
    const res = await app.request("/api/refresh?scope=all", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(sent().url).toBe("http://192.168.1.10:3456/api/refresh?scope=all");
    expect(sent().init.method).toBe("DELETE");
  });

  it("forwards a single-group cancel", async () => {
    const { app, sent } = setup();
    expect((await app.request("/api/refresh?groupId=643&scope=group", { method: "DELETE" })).status).toBe(200);
    expect(sent().url).toBe("http://192.168.1.10:3456/api/refresh?scope=group&groupId=643");
  });

  it.each([
    "/api/refresh",
    "/api/refresh?scope=group",
    "/api/refresh?scope=group&groupId=0",
    "/api/refresh?scope=group&groupId=04",
    "/api/refresh?scope=group&groupId=4&groupId=5",
    "/api/refresh?scope=group&groupId=../x",
    "/api/refresh?scope=all&x=1",
  ])(
    "refuses cancel %s",
    async (path) => {
      const { app, fetch } = setup();
      expect((await app.request(path, { method: "DELETE" })).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe("channel re-check writes", () => {
  const post = (body: unknown) => ({
    method: "POST",
    headers: { ...browserHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  it("forwards a single-channel queue, rebuilt from the parsed body", async () => {
    const { app, sent } = setup();
    expect((await app.request("/api/refresh", post({ scope: "channel", channelId: 462 }))).status).toBe(200);
    expect(sent().init.body).toBe('{"scope":"channel","channelId":462}');
  });

  it("forwards a single-channel cancel", async () => {
    const { app, sent } = setup();
    const res = await app.request("/api/refresh?scope=channel&channelId=462", { method: "DELETE", headers: browserHeaders });
    expect(res.status).toBe(200);
    expect(sent().url).toBe("http://192.168.1.10:3456/api/refresh?scope=channel&channelId=462");
  });

  it.each([
    [{ scope: "channel", channelId: "462" }],
    [{ scope: "channel", channelId: 0 }],
    [{ scope: "channel", channelId: 462, groupId: 1 }],
    [{ scope: "channel" }],
    [{ scope: "stream", streamId: 1 }],
  ])("refuses %o without calling Podium", async (request) => {
    const { app, fetch } = setup();
    expect((await app.request("/api/refresh", post(request))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("soak writes", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST",
    headers: { ...browserHeaders, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  it.each([
    [{ scope: "stream", id: 8135 }],
    [{ scope: "channel", id: 462 }],
  ])("forwards %o, rebuilt from the parsed body", async (request) => {
    const { app, sent } = setup("tok");
    expect((await app.request("/api/soak", post(request))).status).toBe(200);
    expect(sent().url).toBe("http://192.168.1.10:3456/api/soak");
    expect(sent().init.method).toBe("POST");
    expect(sent().init.body).toBe(JSON.stringify(request));
    expect(sent().headers.get("authorization")).toBe("Bearer tok");
  });

  it.each([
    [{ scope: "all" }],
    [{ scope: "group", id: 1 }],
    [{ scope: "channels", id: [1, 2] }],
    [{ scope: "stream", id: "8135" }],
    [{ scope: "stream", id: -1 }],
    [{ scope: "stream", id: 1, now: true }],
    [{ scope: "stream", id: 1, seconds: 900 }],
  ])("refuses %o without calling Podium", async (request) => {
    const { app, fetch } = setup();
    expect((await app.request("/api/soak", post(request))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards cancelling one stream's soak", async () => {
    const { app, sent } = setup();
    const res = await app.request("/api/soak?streamId=8135", { method: "DELETE", headers: browserHeaders });
    expect(res.status).toBe(200);
    expect(sent().url).toBe("http://192.168.1.10:3456/api/soak?streamId=8135");
    expect(sent().init.method).toBe("DELETE");
  });

  it.each(["/api/soak", "/api/soak?streamId=abc", "/api/soak?streamId=1&streamId=2", "/api/soak?streamId=1&all=1"])(
    "refuses DELETE %s (never the whole queue)",
    async (path) => {
      const { app, fetch } = setup();
      expect((await app.request(path, { method: "DELETE", headers: browserHeaders })).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("refuses a cross-site soak", async () => {
    const { app, fetch } = setup();
    const res = await app.request("/api/soak", post({ scope: "stream", id: 1 }, { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still lists the soak queue on GET", async () => {
    const { app, sent } = setup();
    expect((await app.request("/api/soak")).status).toBe(200);
    expect(sent().init.method).toBe("GET");
  });
});

describe("upstream failures", () => {
  it("maps a network error to 502", async () => {
    const { app } = setup(undefined, () => Promise.reject(new TypeError("fetch failed")));
    const res = await app.request("/api/health");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unreachable" });
  });

  it("maps a timeout to 504", async () => {
    const { app } = setup(undefined, () => Promise.reject(new DOMException("t", "TimeoutError")));
    expect((await app.request("/api/health")).status).toBe(504);
  });

  it("maps a body that times out after the headers to 504", async () => {
    const stalled = new ReadableStream({
      start(controller) {
        controller.error(new DOMException("t", "TimeoutError"));
      },
    });
    const { app } = setup(undefined, () => new Response(stalled, { headers: { "content-type": "application/json" } }));
    expect((await app.request("/api/dead")).status).toBe(504);
  });

  it("passes a bodiless status through without crashing", async () => {
    const { app } = setup(undefined, () => new Response(null, { status: 204 }));
    const res = await app.request("/api/refresh?scope=all", { method: "DELETE", headers: { host: "rostrum.lan" } });
    expect(res.status).toBe(204);
  });

  it("refuses an oversized body by its Content-Length without reading it", async () => {
    const { app, fetch } = setup();
    const res = await app.request("/api/refresh", {
      method: "POST",
      body: '{"scope":"all"}',
      headers: { "content-type": "application/json", "content-length": "5000", host: "rostrum.lan" },
    });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
