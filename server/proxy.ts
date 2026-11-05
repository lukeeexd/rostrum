import { Hono, type Context } from "hono";
import { redactUrls } from "./redact";
import type { ServerConfig } from "./config";
import type { Fetch } from "./upstream";

/**
 * The only Podium calls Rostrum makes. Anything else under /api is refused
 * here and never reaches Podium, so Rostrum is not an open relay to an
 * instance that can reorder live channels.
 */
const READS = ["/api/health", "/api/stats", "/api/progress", "/api/dead"];

/** /api/dead walks Dispatcharr, so it gets longer than the cheap reads. */
const TIMEOUT_MS = { default: 15_000, "/api/dead": 60_000 } as const;
const MAX_BODY_BYTES = 1024;
/** Statuses a Response may not carry a body with. */
const NULL_BODY = new Set([101, 204, 205, 304]);

export interface ProxyOptions extends Pick<ServerConfig, "upstream" | "token"> {
  /** Injected in tests. */
  fetch?: Fetch;
}

const json = (c: Context, status: number, error: string, extra?: Record<string, string>) =>
  c.json({ error }, status as 400, extra);

/**
 * Same rule Podium applies: a write must not come from another site. Without
 * it, any page the user visits could POST to Rostrum on the LAN and, through
 * the token Rostrum holds, to Podium.
 */
function isCrossSite(c: Context): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = c.req.header("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== c.req.header("host");
  } catch {
    return true;
  }
}

/** The only re-check marks Rostrum may set or clear: the whole catalogue, one group, or one channel. */
export type Recheck = { scope: "all" } | { scope: "group"; groupId: number } | { scope: "channel"; channelId: number };

/** Where a write's fields came from: a JSON body (ids are numbers) or a query string (ids are digits). */
type Source = "body" | "query";

/** A positive id: a JSON number in a body, a run of digits in a query. Anything else is null. */
function positiveId(v: unknown, from: Source): number | null {
  const n = from === "query" ? (typeof v === "string" && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : null) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** A re-check from a JSON body or query values, exactly; anything extra or malformed is null. */
export function parseRecheck(fields: Record<string, unknown>, from: Source): Recheck | null {
  const keys = Object.keys(fields).sort().join(",");
  if (keys === "scope" && fields.scope === "all") return { scope: "all" };
  if (keys === "groupId,scope" && fields.scope === "group") {
    const groupId = positiveId(fields.groupId, from);
    if (groupId != null) return { scope: "group", groupId };
  }
  if (keys === "channelId,scope" && fields.scope === "channel") {
    const channelId = positiveId(fields.channelId, from);
    if (channelId != null) return { scope: "channel", channelId };
  }
  return null;
}

async function readJsonBody(c: Context): Promise<Record<string, unknown> | null> {
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) return null;
  // Refuse oversized bodies before buffering them.
  if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

const recheckQuery = (r: Recheck) =>
  r.scope === "all" ? "scope=all" : r.scope === "group" ? `scope=group&groupId=${r.groupId}` : `scope=channel&channelId=${r.channelId}`;

/** The only soak requests Rostrum may queue: one stream, or one channel's streams. */
export type SoakRequest = { scope: "stream" | "channel"; id: number };

/** A soak request from a JSON body, exactly: `{scope, id}` with a positive integer id. Anything else is null. */
export function parseSoak(fields: Record<string, unknown>): SoakRequest | null {
  if (Object.keys(fields).sort().join(",") !== "id,scope") return null;
  if (fields.scope !== "stream" && fields.scope !== "channel") return null;
  const id = positiveId(fields.id, "body");
  return id == null ? null : { scope: fields.scope, id };
}

/** A soak cancel for one stream, exactly `streamId=<id>`. The bare DELETE (clear the whole queue) is not allowed. */
export function parseSoakCancel(fields: Record<string, unknown>): { streamId: number } | null {
  if (Object.keys(fields).join(",") !== "streamId") return null;
  const streamId = positiveId(fields.streamId, "query");
  return streamId == null ? null : { streamId };
}

/**
 * The write endpoints: GET lists what is queued (the query is dropped);
 * POST and DELETE are rebuilt from what the parsers accept, nothing else.
 */
const WRITES: Record<string, { invalid: string; body: (fields: Record<string, unknown>) => object | null; query: (fields: Record<string, unknown>) => string | null }> = {
  "/api/refresh": {
    invalid: "only a whole-catalogue, single-group or single-channel re-check is accepted",
    body: (f) => parseRecheck(f, "body"),
    query: (f) => {
      const r = parseRecheck(f, "query");
      return r && recheckQuery(r);
    },
  },
  "/api/soak": {
    invalid: "only a soak of one stream or one channel, or cancelling one stream's soak, is accepted",
    body: parseSoak,
    query: (f) => {
      const s = parseSoakCancel(f);
      return s && `streamId=${s.streamId}`;
    },
  },
};
const KNOWN = new Set([...READS, ...Object.keys(WRITES)]);

export function createProxy({ upstream, token, fetch = globalThis.fetch }: ProxyOptions) {
  const app = new Hono();

  app.all("/api/*", async (c) => {
    const { path } = c.req;
    const method = c.req.method;
    if (!KNOWN.has(path)) return json(c, 404, "not_found");

    // Write endpoints: GET lists what is queued; POST/DELETE queue or cancel one thing.
    const isRead = READS.includes(path) || method === "GET" || method === "HEAD";
    const allowed = READS.includes(path) ? ["GET", "HEAD"] : ["GET", "HEAD", "POST", "DELETE"];
    if (!allowed.includes(method)) return json(c, 405, "method_not_allowed", { allow: allowed.join(", ") });

    // Build the outgoing request from scratch: nothing from the browser
    // (Origin, Sec-Fetch-*, Cookie, Referer, Authorization, Host) is copied.
    const target = new URL(path, upstream);
    const headers = new Headers({ accept: "application/json" });
    if (token) headers.set("authorization", `Bearer ${token}`);
    let body: string | undefined;

    if (!isRead) {
      if (isCrossSite(c)) return json(c, 403, "cross_site_write_refused");
      const write = WRITES[path];
      if (method === "POST") {
        const fields = await readJsonBody(c);
        const parsed = fields && write.body(fields);
        if (!parsed) return json(c, 400, write.invalid);
        headers.set("content-type", "application/json");
        body = JSON.stringify(parsed);
      } else {
        const query = c.req.queries();
        const single = Object.values(query).every((v) => v.length === 1);
        const search = single ? write.query(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, v[0]]))) : null;
        if (!search) return json(c, 400, write.invalid);
        target.search = search;
      }
    }

    let res: Response;
    let payload: ArrayBuffer | null;
    try {
      res = await fetch(target, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(path in TIMEOUT_MS ? TIMEOUT_MS[path as "/api/dead"] : TIMEOUT_MS.default),
      });
      // Read the body inside the try: Podium can send headers and then stall
      // (/api/dead walks Dispatcharr), and that must still map to 504/502.
      payload = method === "HEAD" || NULL_BODY.has(res.status) ? null : await res.arrayBuffer();
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      return timedOut ? json(c, 504, "upstream_timeout") : json(c, 502, "upstream_unreachable");
    }

    // Pass status and body through; keep only the content type, so nothing
    // like Set-Cookie or Location from Podium leaks to the browser.
    const out = new Headers({ "cache-control": "no-store" });
    const type = res.headers.get("content-type");
    if (type) out.set("content-type", type);
    return new Response(payload && redactBody(payload, type), { status: res.status, headers: out });
  });

  return app;
}

/**
 * Provider stream URLs carry the IPTV account's username and password in
 * their path, and Podium includes them verbatim in errors. Every string in a
 * JSON response (or any text body) has its URLs cut to the host here, so they
 * never leave the server, whichever field they turn up in.
 */
export function redactBody(payload: ArrayBuffer, type: string | null): ArrayBuffer | string {
  if (!type || (!type.includes("json") && !type.startsWith("text/"))) return payload;
  const text = new TextDecoder().decode(payload);
  if (type.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(text, (_k, v: unknown) => (typeof v === "string" ? redactUrls(v) : v)));
    } catch {
      /* not valid JSON after all: fall back to redacting the raw text */
    }
  }
  return redactUrls(text);
}
