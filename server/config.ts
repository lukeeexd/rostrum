import { normaliseHostEntry } from "./hosts";

export interface ServerConfig {
  /** Podium's base URL, origin only (no path). */
  upstream: URL;
  /** Sent to Podium as `Authorization: Bearer …` when set. */
  token?: string;
  port: number;
  /** Extra Host names to answer to beyond private ones (ROSTRUM_ALLOWED_HOSTS). */
  allowedHosts: string[];
  /**
   * Optional read access to Dispatcharr, for the per-stream FPS / codec /
   * audio stats Podium writes there (until Podium's own preview carries them).
   */
  dispatcharr?: { url: URL; apiKey: string };
  /** SQLite file for long-term trends (HISTORY_DB); history is off without one. */
  historyDb?: string;
}

/** Reads and validates the environment. Throws with a readable message. */
export function parseConfig(env: Record<string, string | undefined>): ServerConfig {
  const raw = env.PODIUM_URL?.trim();
  if (!raw) throw new Error("PODIUM_URL is required, e.g. PODIUM_URL=http://192.168.1.50:3456");
  const upstream = parseOrigin("PODIUM_URL", raw);

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535: ${env.PORT}`);
  }

  const token = env.PODIUM_TOKEN?.trim() || undefined;
  const allowedHosts = (env.ROSTRUM_ALLOWED_HOSTS ?? "").split(/[\s,]+/).map(normaliseHostEntry).filter(Boolean);
  const historyDb = env.HISTORY_DB?.trim() || undefined;
  return { upstream, token, port, allowedHosts, dispatcharr: parseDispatcharr(env), historyDb };
}

function parseDispatcharr(env: Record<string, string | undefined>): ServerConfig["dispatcharr"] {
  const url = env.DISPATCHARR_URL?.trim();
  const apiKey = env.DISPATCHARR_API_KEY?.trim();
  if (!url && !apiKey) return undefined;
  // Half a configuration silently degrading would be worse than failing at start.
  if (!url || !apiKey) throw new Error("Set both DISPATCHARR_URL and DISPATCHARR_API_KEY, or neither");
  return { url: parseOrigin("DISPATCHARR_URL", url), apiKey };
}

/** An http(s) origin with no path, query or fragment. Errors never echo the value: it could carry a login. */
function parseOrigin(name: string, raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${name} must be http(s), not ${url.protocol}`);
  if (url.pathname.replace(/\/+$/, "") !== "" || url.search || url.hash) {
    throw new Error(`${name} must be just the origin (scheme, host, port), without a path`);
  }
  return new URL(url.origin);
}
