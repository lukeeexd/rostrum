/**
 * Display formatting. Everything that depends on the clock takes `now`
 * explicitly, so it stays pure and testable; components get `now` from useNow.
 */

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 0 → "0s", 75 → "1m 15s", 8040 → "2h 14m", 97200 → "1d 3h". Null → "—". */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < MIN) return `${s}s`;
  if (s < HOUR) return pair(Math.floor(s / MIN), "m", s % MIN, "s");
  if (s < DAY) return pair(Math.floor(s / HOUR), "h", Math.floor((s % HOUR) / MIN), "m");
  return pair(Math.floor(s / DAY), "d", Math.floor((s % DAY) / HOUR), "h");
}

function pair(a: number, ua: string, b: number, ub: string): string {
  return b ? `${a}${ua} ${b}${ub}` : `${a}${ua}`;
}

export const formatMs = (ms: number | null | undefined) => formatSeconds(ms == null ? ms : ms / 1000);

/** "3m ago", "just now". */
export function formatAgo(epochMs: number | null | undefined, now: number): string {
  if (epochMs == null) return "never";
  const s = (now - epochMs) / 1000;
  return s < 5 ? "just now" : `${formatSeconds(s)} ago`;
}

/** "in 4m 10s", or "due now" once it has passed. */
export function formatCountdown(epochMs: number | null | undefined, now: number): string {
  if (epochMs == null) return "not scheduled";
  const s = (epochMs - now) / 1000;
  return s <= 0 ? "due now" : `in ${formatSeconds(s)}`;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
export const formatClock = (epochMs: number) => clock.format(epochMs);

const integer = new Intl.NumberFormat();
/** A provider (or other) name that may be blank. */
export const orUnnamed = (name: string | null | undefined) => name || "(unnamed)";

export const formatInt = (n: number | null | undefined) => (n == null ? "—" : integer.format(n));

/** Share of `part` in `whole` as 0–100, 0 when there is no whole. */
export const percent = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0);

export const formatPercent = (part: number, whole: number) => (whole > 0 ? `${Math.round(percent(part, whole))}%` : "—");

/** 850 → "850 kbps", 4509 → "4.5 Mbps". */
export function formatKbps(kbps: number | null | undefined): string {
  if (!kbps) return "—";
  return kbps >= 1000 ? `${(Math.round(kbps / 100) / 10).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`;
}
