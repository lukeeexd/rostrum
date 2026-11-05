/** A failed call to Podium or Dispatcharr, classified for the HTTP layer. */
export class UpstreamError extends Error {
  constructor(
    readonly kind: "timeout" | "unreachable" | "status" | "parse",
    readonly status?: number,
  ) {
    super(status ? `upstream ${kind} ${status}` : `upstream ${kind}`);
    this.name = "UpstreamError";
  }
}

export type Fetch = typeof globalThis.fetch;

/** One vocabulary for "why did the upstream call fail", shared by the routes and the stream details. */
export function classify(err: unknown): "auth" | "not_found" | "timeout" | "unreachable" {
  if (!(err instanceof UpstreamError)) return "unreachable";
  if (err.kind === "timeout") return "timeout";
  if (err.status === 401 || err.status === 403) return "auth";
  if (err.status === 400 || err.status === 404) return "not_found";
  return "unreachable";
}

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** Aborts with the caller (e.g. the browser went away). */
  signal?: AbortSignal;
}

/**
 * A GET/POST returning the body as text. Never follows redirects, reads the
 * body inside the timeout, and turns every failure into an UpstreamError.
 */
export async function fetchText(fetch: Fetch, url: URL, opts: FetchJsonOptions & { accept?: string }): Promise<string> {
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { accept: opts.accept ?? "application/json", ...opts.headers },
      body: opts.body,
      redirect: "manual",
      signal,
    });
    text = await res.text();
  } catch (err) {
    const name = (err as Error)?.name;
    throw new UpstreamError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable");
  }
  if (!res.ok) throw new UpstreamError("status", res.status);
  return text;
}

/** fetchText, parsed as JSON. */
export async function fetchJson<T>(fetch: Fetch, url: URL, opts: FetchJsonOptions): Promise<T> {
  const text = await fetchText(fetch, url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError("parse");
  }
}
