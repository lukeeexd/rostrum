import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "../../server/app";
import { parseConfig } from "../../server/config";
import { buildCatalogue } from "./catalogue";
import { createDemoPodium } from "./podium";
import { seedHistory } from "./seed";

/**
 * `npm run demo`: Rostrum against a made-up Podium, with a week of made-up
 * history, so it can be tried (and screenshotted) without a Podium. Nothing
 * here touches a real Podium or Dispatcharr.
 */

const PODIUM_PORT = Number(process.env.DEMO_PODIUM_PORT ?? 3457);
const PORT = Number(process.env.PORT ?? 8090);
const DB = path.resolve(process.env.DEMO_DB ?? "data/demo.db");

if (!existsSync("dist/index.html")) {
  console.error("rostrum demo: build the web app first (npm run build:web), or use `npm run demo`, which does.");
  process.exit(1);
}

const now = Date.now();
const groups = buildCatalogue(now);

// A fresh week of history each start. (On Windows a running demo holds the file open.)
try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
} catch {
  console.error(`rostrum demo: ${path.relative(process.cwd(), DB)} is in use. Is another demo running? Stop it, or set DEMO_DB to use another file.`);
  process.exit(1);
}
seedHistory(DB, groups, now);

/** A port already in use is the likely failure; say which and how to pick another. */
const onError = (port: number, variable: string) => (err: NodeJS.ErrnoException) => {
  console.error(
    err.code === "EADDRINUSE"
      ? `rostrum demo: port ${port} is already in use; set ${variable} to use another.`
      : `rostrum demo: ${err.message}`,
  );
  process.exit(1);
};

// Both servers listen on this machine only: the demo is for you, not the network.
serve({ fetch: createDemoPodium(groups).fetch, port: PODIUM_PORT, hostname: "127.0.0.1" }, () => {
  const config = parseConfig({ PODIUM_URL: `http://127.0.0.1:${PODIUM_PORT}`, PORT: String(PORT), HISTORY_DB: DB });
  serve({ fetch: createApp(config, "dist").fetch, port: PORT, hostname: "127.0.0.1" }, () => {
    console.log(`rostrum demo: open http://localhost:${PORT}`);
    console.log("rostrum demo: every channel, stream and provider here is made up; Ctrl+C to stop.");
  }).on("error", onError(PORT, "PORT"));
}).on("error", onError(PODIUM_PORT, "DEMO_PODIUM_PORT"));
