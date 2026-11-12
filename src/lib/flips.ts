import type { StreamStatus } from "./streamStatus";

/**
 * What a flip is, for every page and the server (relative imports only): a
 * stream going from playable (alive, low bitrate) to broken (dead, black) or
 * back between one probe and the next.
 */
export const isBroken = (s: StreamStatus) => s === "dead" || s === "black";

/** Flips in a range that make a stream count as flaky. */
export const FLAKY_FLIPS = 2;

export const isFlaky = (flips: number) => flips >= FLAKY_FLIPS;
