import {
  STREAM_STATES,
  type ProviderStats,
  type ProvidersResponse,
  type ResolutionBucket,
  type StreamSearchResponse,
} from "../src/api/types";
import { shared, untilAborted } from "./load";
import { parsePrometheus, type Sample } from "./metrics";
import { id, num, str } from "./pick";
import type { PodiumClient, PodiumState, PodiumStreamSearch } from "./podium";

/**
 * The Streams and Providers pages: Podium's catalogue search and its
 * per-provider metrics, projected into typed, redacted records.
 */

export function projectSearch(raw: PodiumStreamSearch, query: string): StreamSearchResponse {
  const results = (raw.groups ?? []).map((g) => ({
    name: str(g.normalized) ?? "",
    count: num(g.count) ?? 0,
    providers: (g.providers ?? []).flatMap((p) => str(p) ?? []),
    samples: (g.samples ?? []).flatMap((s) => str(s) ?? []),
    channelIds: (g.claimedByChannelIds ?? []).flatMap((c) => id(c) ?? []),
  }));
  return {
    query,
    total: num(raw.total) ?? results.length,
    truncated: raw.truncated === true,
    results,
  };
}

const STATES = STREAM_STATES;
const RESOLUTIONS: ResolutionBucket[] = ["uhd", "fhd", "hd", "sd", "unknown"];
const BITRATE_KEYS = ["all", "uhd", "fhd", "hd", "sd"] as const;

/** A provider's record with every count at zero and every reading unknown. */
function emptyProvider(name: string, maxStreams: number | null): ProviderStats {
  return {
    name,
    maxStreams,
    streams: Object.fromEntries(STATES.map((s) => [s, 0])) as ProviderStats["streams"],
    deadReasons: {},
    resolutions: Object.fromEntries(RESOLUTIONS.map((r) => [r, 0])) as ProviderStats["resolutions"],
    bitrateKbps: {},
    bitrateMeasured: null,
    score: null,
    verdictAgeSeconds: { median: null, max: null },
    channels: null,
    rank1Channels: null,
    rank1Healthy: null,
  };
}

const isOneOf = <T extends string>(list: readonly T[], v: string | undefined): v is T => list.includes(v as T);

/**
 * Folds Podium's podium_provider_* series into one record per provider (see
 * the HELP text in /api/metrics for each). Unknown series and labels are
 * ignored, so a newer Podium adding metrics does not break this.
 */
export function projectProviders(samples: Sample[], state?: Pick<PodiumState, "providers">): ProvidersResponse {
  const limits = new Map<string, number>();
  for (const p of state?.providers ?? []) {
    const name = str(p.name);
    const limit = num(p.maxStreams);
    if (name && limit != null) limits.set(name, limit);
  }

  const byName = new Map<string, ProviderStats>();
  const provider = (raw: string) => {
    const name = str(raw) ?? "";
    let p = byName.get(name);
    if (!p) byName.set(name, (p = emptyProvider(name, limits.get(name) ?? null)));
    return p;
  };

  for (const { name, labels, value } of samples) {
    if (!name.startsWith("podium_provider_") || labels.provider === undefined) continue;
    const p = provider(labels.provider);
    switch (name) {
      case "podium_provider_streams":
        if (isOneOf(STATES, labels.state)) p.streams[labels.state] = value;
        break;
      case "podium_provider_dead_streams":
        if (labels.reason && value > 0) p.deadReasons[labels.reason] = value;
        break;
      case "podium_provider_resolution_streams":
        if (isOneOf(RESOLUTIONS, labels.resolution)) p.resolutions[labels.resolution] = value;
        break;
      case "podium_provider_bitrate_kbps":
        if (labels.stat === "median" && isOneOf(BITRATE_KEYS, labels.resolution)) p.bitrateKbps[labels.resolution] = value;
        break;
      case "podium_provider_bitrate_measured":
        p.bitrateMeasured = value;
        break;
      case "podium_provider_score":
        if (labels.stat === "median") p.score = value;
        break;
      case "podium_provider_verdict_age_seconds":
        if (labels.stat === "median" || labels.stat === "max") p.verdictAgeSeconds[labels.stat] = value;
        break;
      case "podium_provider_channels":
        p.channels = value;
        break;
      case "podium_provider_rank1_channels":
        p.rank1Channels = value;
        break;
      case "podium_provider_rank1_healthy":
        p.rank1Healthy = value;
        break;
    }
  }

  // Busiest first: the provider serving the most channels first.
  const providers = [...byName.values()].sort(
    (a, b) => (b.rank1Channels ?? 0) - (a.rank1Channels ?? 0) || a.name.localeCompare(b.name),
  );
  return { providers };
}

export function createCatalogueService({ podium, now = Date.now }: { podium: PodiumClient; now?: () => number }) {
  const searches = shared<string, StreamSearchResponse>(30_000, 100, now);
  const metrics = shared<"providers", ProvidersResponse>(30_000, 1, now);

  return {
    /** `query` must already be validated (2..100 characters). */
    search(query: string, signal?: AbortSignal) {
      const q = query.trim();
      return untilAborted(
        searches(q.toLowerCase(), async () => projectSearch(await podium.searchStreams(q), q)),
        signal,
      );
    },

    providers(signal?: AbortSignal) {
      return untilAborted(
        metrics("providers", async () => {
          const [text, state] = await Promise.all([podium.metrics(), podium.state().catch(() => undefined)]);
          return projectProviders(parsePrometheus(text), state);
        }),
        signal,
      );
    },
  };
}

export type CatalogueService = ReturnType<typeof createCatalogueService>;
