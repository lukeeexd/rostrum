import type { MediaSource, StreamMedia } from "../src/api/types";
import { redactUrls } from "./redact";

/**
 * Field pickers for projecting upstream records into Rostrum's wire types.
 * Strings are always redacted, so whatever field a provider URL turns up in,
 * it leaves as a host only.
 */

/** A positive number, or null (0 means "unknown" in Podium's probe results). */
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** A non-empty, redacted string, or null. */
export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? redactUrls(v.trim()) : null);

/** An id we are willing to put in an upstream URL: a positive safe integer. */
export const id = (v: unknown): number | null => (Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null);

/** StreamMedia from already-picked fields; null when the probe reported none of them. */
export function buildMedia(source: MediaSource, fields: Omit<StreamMedia, "source">): StreamMedia | null {
  return Object.values(fields).some((v) => v !== null) ? { source, ...fields } : null;
}
