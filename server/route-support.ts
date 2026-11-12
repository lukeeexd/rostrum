import { UpstreamError } from "./upstream";

/**
 * Whether a Podium has an optional route (one added in a later Podium
 * version), learned by asking it. A Podium without it is remembered with its
 * version and asked again when that version changes (looked at every
 * VERSION_CHECK_MS) or after ROUTE_RECHECK_MS, so an upgrade is noticed
 * without asking for the route on every read. The version is a cheap
 * /api/health read; the plain recheck covers a Podium that does not report
 * one, or gains the route without a new version (a development build).
 */

/** After a Podium says it has no such route, ask again this long after, whatever its version. */
export const ROUTE_RECHECK_MS = 30 * 60_000;
/** Meanwhile, look at its version at most this often, to notice an upgrade sooner. */
export const VERSION_CHECK_MS = 5 * 60_000;

/** A Podium without the route: 404, or 405 from a framework that knows the path but not the method. */
export const routeMissing = (err: unknown) => err instanceof UpstreamError && (err.status === 404 || err.status === 405);

export function createRouteSupport(version: () => Promise<string | null>, now: () => number = Date.now) {
  let missing: { version: string | null; at: number; checkedAt: number } | null = null;
  return {
    /** False while the route is known to be missing and nothing suggests it has appeared. */
    async worthAsking(): Promise<boolean> {
      if (!missing) return true;
      const t = now();
      if (t - missing.at >= ROUTE_RECHECK_MS) return true;
      if (t - missing.checkedAt < VERSION_CHECK_MS) return false;
      missing.checkedAt = t;
      return (await version()) !== missing.version;
    },
    /** The route answered. */
    markFound() {
      missing = null;
    },
    /** The route is not there: remember which version said so. */
    async markMissing() {
      const t = now();
      missing = { version: await version(), at: t, checkedAt: t };
    },
  };
}

/** A Podium's version from /api/health, or null when it cannot say. */
export const podiumVersion = (podium: { health(): Promise<{ version?: string }> }) => () =>
  podium.health().then((h) => h.version ?? null, () => null);
