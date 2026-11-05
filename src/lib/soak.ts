import type { SoakResult, SoakTally, SoakVerdict } from "../api/types";
import { formatSeconds } from "./format";

/**
 * The soak rule, in one place for the server's log and every page that shows
 * a soak. Unreachable: Podium could not connect. Dropped: it connected but
 * dropped or had to redial. Clean: neither. (Relative imports only: the
 * server bundles this file too.)
 */
export function soakVerdict(r: Pick<SoakResult, "drops" | "failedDials" | "unreachable">): SoakVerdict {
  if (r.unreachable) return "unreachable";
  return r.drops > 0 || r.failedDials > 0 ? "dropped" : "clean";
}

/** Soaks in a tally that were not clean. */
export const notClean = (t: SoakTally) => t.dropped + t.unreachable;

/** A soak worth a second look: anything but clean. */
export const soakNeedsAttention = (soak: SoakResult | null) => soak != null && soakVerdict(soak) !== "clean";

/** A stream's last soak test: "clean · 1m 30s", "2 drops · 1m 30s", "unreachable", or "—" if never soaked. */
export function formatSoak(soak: SoakResult | null): string {
  if (!soak) return "—";
  if (soak.unreachable) return "unreachable";
  const held = formatSeconds(soak.heldMs / 1000);
  const problems = [
    soak.drops ? `${soak.drops} ${soak.drops === 1 ? "drop" : "drops"}` : "",
    soak.failedDials ? `${soak.failedDials} failed ${soak.failedDials === 1 ? "dial" : "dials"}` : "",
  ].filter(Boolean);
  return `${problems.length ? problems.join(", ") : "clean"} · ${held}`;
}
