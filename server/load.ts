import { UpstreamError } from "./upstream";

/**
 * Load control for Rostrum's composed reads: a concurrency limiter, a TTL
 * cache that shares loads in flight, and a per-caller abort that does not
 * cancel the shared load for everyone else.
 */

/**
 * At most `slots` tasks running at once across every caller. A finishing task
 * hands its slot straight to the next waiter, so a newcomer can never slip in
 * between and push the count over.
 */
export function createLimiter(slots: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < slots) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve)); // the slot is handed over, already counted
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/**
 * Caches a loader's result for `ttlMs` and shares one in-flight load between
 * callers. Failures are not kept, unless `failTtlMs` is set: then a failure is
 * repeated to callers for that long instead of loading again at once.
 */
export function shared<K, V>(ttlMs: number, maxEntries: number, now: () => number, failTtlMs = 0) {
  const done = new Map<K, { at: number; value: V }>();
  const failed = new Map<K, { at: number; error: unknown }>();
  const pending = new Map<K, Promise<V>>();
  return (key: K, load: () => Promise<V>): Promise<V> => {
    const hit = done.get(key);
    if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.value);
    const miss = failed.get(key);
    if (miss && now() - miss.at < failTtlMs) return Promise.reject(miss.error);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const p = load()
      .then(
        (value) => {
          done.delete(key);
          failed.delete(key);
          if (done.size >= maxEntries) done.delete(done.keys().next().value!);
          done.set(key, { at: now(), value });
          return value;
        },
        (error: unknown) => {
          if (failTtlMs > 0) {
            if (failed.size >= maxEntries) failed.delete(failed.keys().next().value!);
            failed.set(key, { at: now(), error });
          }
          throw error;
        },
      )
      .finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  };
}

/**
 * Waits for a shared load, but gives up when this caller's signal fires. The
 * load itself carries on for anyone else waiting on it (it has its own
 * upstream timeout), so one impatient caller cannot fail the others.
 */
export function untilAborted<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new UpstreamError("timeout"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new UpstreamError("timeout"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}


/**
 * The result of `p` if it settles within `ms`, otherwise null (a failure is
 * null too). `p` itself carries on, so a shared load still finishes for the
 * next caller; the timer does not keep the process alive.
 */
export function withinOrNull<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
  });
  return Promise.race([p.catch(() => null), late]).finally(() => clearTimeout(timer));
}
