import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import type { ServerConfig } from "./config";
import { isAllowedHost, normaliseHostEntry } from "./hosts";
import { createBackend } from "./backend";
import type { Fetch } from "./upstream";
import { VERSION } from "./version";

/** Logs each refused hostname once, so a misconfigured name shows up in `docker logs`. */
const refused = new Set<string>();
function warnRefused(name: string) {
  if (refused.has(name) || refused.size >= 50) return;
  refused.add(name);
  console.warn(`rostrum: refused Host "${name}" (not private, not in ROSTRUM_ALLOWED_HOSTS)`);
}

/**
 * React sets inline style widths (bars, charts), hence 'unsafe-inline' for
 * styles only. Scripts, data and fonts all come from this origin.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Hashed assets never change; index.html must revalidate so a new deploy's
 * assets are picked up. (Set here rather than in serveStatic's onFound,
 * which runs after the response is built and so cannot add headers.)
 */
function cacheControl(c: Context): string | undefined {
  if (c.res.headers.has("cache-control") || c.res.status !== 200) return undefined;
  if (c.req.path.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (c.res.headers.get("content-type")?.startsWith("text/html")) return "no-cache";
  return undefined;
}

/**
 * The production app: host guard, security headers, /healthz, the Podium
 * proxy under /api, and the built SPA from `dist` (a path relative to cwd).
 */
export function createApp(config: ServerConfig, dist: string, fetch?: Fetch) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const host = c.req.header("host");
    if (!isAllowedHost(host, config.allowedHosts)) {
      const name = normaliseHostEntry(host ?? "");
      warnRefused(name);
      return c.json({ error: "host_not_allowed", host: name, hint: `add ${name} to ROSTRUM_ALLOWED_HOSTS` }, 403);
    }
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("x-frame-options", "DENY");
    c.header("referrer-policy", "same-origin");
    c.header("content-security-policy", CSP);
    const cache = cacheControl(c);
    if (cache) c.header("cache-control", cache);
  });

  app.get("/healthz", (c) => c.json({ ok: true, version: VERSION }));
  app.route("/", createBackend(config, fetch));

  app.use("/assets/*", serveStatic({ root: dist }));
  // A missing hashed asset (an old tab after a deploy) is a 404, not index.html.
  app.all("/assets/*", (c) => c.text("Not found", 404));

  app.use("*", serveStatic({ root: dist }));
  // SPA fallback for client-side routes (/live, /dead, …), but not for files.
  app.get("*", async (c, next) => {
    if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.text("Not found", 404);
    return serveStatic({ path: `${dist}/index.html` })(c, next);
  });

  return app;
}
