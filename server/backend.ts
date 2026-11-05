import { Hono, type Context } from "hono";
import { createCatalogueService, type CatalogueService } from "./catalogue";
import { createChannelsService, type ChannelsService } from "./channels";
import type { ServerConfig } from "./config";
import { createDispatcharrClient } from "./dispatcharr";
import { createHistory, isHistoryRange, RANGE_MS, type History } from "./history";
import { createPodiumClient } from "./podium";
import { createProxy } from "./proxy";
import { createConnectEvents, NAMES_DEADLINE_MS, type ConnectEventsService } from "./connect";
import { collectSoaks } from "./soaks";
import { untilAborted, withinOrNull } from "./load";
import { problemCounts, projectProblems } from "./problems";
import { createStreamIndex, type StreamIndex } from "./streams-index";
import { classify, UpstreamError, type Fetch } from "./upstream";
import type { HistoryRange } from "../src/api/types";

/**
 * Everything under /api: Rostrum's own composed reads (/api/rostrum/*), then
 * the allowlisted Podium passthrough. Mounted by both server/app.ts and the
 * Vite dev server, so dev and prod are identical.
 */
export function createBackend(config: ServerConfig, fetch: Fetch = globalThis.fetch) {
  const podium = createPodiumClient({ upstream: config.upstream, token: config.token, fetch });
  const channels = createChannelsService({
    podium,
    dispatcharr: config.dispatcharr && createDispatcharrClient({ ...config.dispatcharr, fetch }),
  });
  const catalogue = createCatalogueService({ podium });
  // One preview walk, shared by the soak log and the names on Connect events.
  const streams = createStreamIndex(podium);
  const connect = createConnectEvents({ podium, streams });
  // Samples on a timer only when HISTORY_DB is set; tests and bare dev runs stay timer-free.
  const history = createHistory({
    file: config.historyDb,
    stats: () => podium.stats(),
    providers: () => catalogue.providers(),
    problems: async () => problemCounts(await streams()),
    soaks: async () => collectSoaks(await streams()),
    connectEvents: async () => (await connect.recent(undefined, { waitForNames: true })).events,
    walk: streams,
  });
  history.start();

  const app = new Hono();
  app.route("/api/rostrum", rostrumRoutes({ channels, catalogue, history, connect, streams }));
  app.route("/", createProxy({ upstream: config.upstream, token: config.token, fetch }));
  // close() stops the history sampler and its database, e.g. when the Vite dev server restarts.
  return Object.assign(app, { close: () => history.close() });
}

/** Podium needs at least two characters; a cap keeps the query (and the cache key) small. */
const QUERY_MIN = 2;
const QUERY_MAX = 100;

interface Services {
  channels: ChannelsService;
  catalogue: CatalogueService;
  history: History;
  connect: ConnectEventsService;
  /** The shared preview walk. */
  streams: () => Promise<StreamIndex>;
}

function rostrumRoutes({ channels, catalogue, history, connect, streams }: Services) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });

  /** A read over ?range= (24h, 7d, 30d or 90d); anything else is refused. */
  const rangeRoute = (fallback: HistoryRange, read: (range: HistoryRange) => unknown) => async (c: Context) => {
    const range = c.req.query("range") ?? fallback;
    if (!isHistoryRange(range)) return c.json({ error: `range must be one of ${Object.keys(RANGE_MS).join(", ")}` }, 400);
    return c.json(await read(range));
  };

  app.get("/groups", async (c) => respond(c, () => channels.groups(c.req.raw.signal)));

  app.get("/channels/:id/streams", async (c) => {
    const id = c.req.param("id");
    if (!/^[1-9]\d{0,8}$/.test(id)) return c.json({ error: "invalid_channel_id" }, 400);
    return respond(c, () => channels.streams(Number(id), c.req.raw.signal), "channel_not_found");
  });

  app.get("/streams", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < QUERY_MIN || q.length > QUERY_MAX) {
      return c.json({ error: `search for ${QUERY_MIN} to ${QUERY_MAX} characters` }, 400);
    }
    return respond(c, () => catalogue.search(q, c.req.raw.signal));
  });

  app.get("/providers", async (c) => respond(c, () => catalogue.providers(c.req.raw.signal)));

  app.get("/channels/:id/history", async (c) => {
    const id = c.req.param("id");
    if (!/^[1-9]\d{0,8}$/.test(id)) return c.json({ error: "invalid_channel_id" }, 400);
    const channelId = Number(id);
    return rangeRoute("7d", async (range) => {
      // The walk says which streams the channel carries now and its name; the log alone still answers without it.
      const channel = (await withinOrNull(streams(), NAMES_DEADLINE_MS))?.channels.find((ch) => ch.id === channelId);
      return history.readChannel(channelId, range, { streamIds: channel?.streams.map((s) => s.streamId), name: channel?.name });
    })(c);
  });

  app.get("/connect-events", async (c) => respond(c, () => connect.recent(c.req.raw.signal)));

  // The walk is shared and cannot be cancelled, but this caller can stop waiting on it.
  app.get("/problems", async (c) => respond(c, async () => projectProblems(await untilAborted(streams(), c.req.raw.signal))));

  app.get("/history", rangeRoute("7d", (r) => history.read(r)));
  app.get("/soaks", rangeRoute("24h", (r) => history.readSoaks(r)));
  app.get("/connect-log", rangeRoute("7d", (r) => history.readConnect(r)));

  app.all("*", (c) => c.json({ error: "not_found" }, 404));
  return app;
}

/**
 * Same error vocabulary as the proxy, so the client explains it the same way.
 * `notFound` names what a Podium 400/404 means for this route, if anything.
 */
async function respond(c: Context, load: () => Promise<unknown>, notFound?: string) {
  try {
    return c.json(await load());
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    switch (classify(err)) {
      case "timeout":
        return c.json({ error: "upstream_timeout" }, 504);
      case "auth":
        return c.json({ error: "podium_refused_token" }, 502);
      case "not_found":
        if (notFound) return c.json({ error: notFound }, 404);
        return c.json({ error: "upstream_unreachable" }, 502);
      default:
        return c.json({ error: "upstream_unreachable" }, 502);
    }
  }
}
