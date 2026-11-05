import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { parseConfig, type ServerConfig } from "./config";

/**
 * Production entry. Bundled by esbuild into dist-server/index.js next to the
 * built SPA in dist/, so the image needs no node_modules.
 */
let config: ServerConfig;
try {
  config = parseConfig(process.env);
} catch (err) {
  console.error(`rostrum: ${(err as Error).message}`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.relative(process.cwd(), path.resolve(here, "../dist")) || ".";

serve({ fetch: createApp(config, dist).fetch, port: config.port }, ({ port }) => {
  console.log(`rostrum: listening on :${port}, proxying Podium at ${config.upstream.origin}`);
  console.log(`rostrum: extra allowed hosts: ${config.allowedHosts.length ? config.allowedHosts.join(", ") : "none"}`);
  console.log(`rostrum: Dispatcharr stats ${config.dispatcharr ? `from ${config.dispatcharr.url.origin}` : "not configured"}`);
});
