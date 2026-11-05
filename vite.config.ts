import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { parseConfig } from "./server/config";
import { createBackend } from "./server/backend";
import { version } from "./package.json";

/**
 * Runs the production backend (server/backend.ts: Rostrum's composed reads
 * plus the allowlisted Podium proxy) inside the Vite dev server, so dev and
 * the container share one code path. PODIUM_URL / PODIUM_TOKEN come from .env without the VITE_ prefix,
 * so they stay in this Node process and never reach the client bundle.
 */
function podiumProxy(env: Record<string, string>): Plugin {
  return {
    name: "rostrum:podium-proxy",
    configureServer(server) {
      const config = parseConfig(env);
      const backend = createBackend(config);
      const listener = getRequestListener(backend.fetch);
      // A restart (config or .env change) builds a new backend; release the old one's history sampler and database.
      server.httpServer?.once("close", backend.close);
      server.config.logger.info(`  ➜  Podium:  ${config.upstream.origin}`);
      server.config.logger.info(`  ➜  Dispatcharr: ${config.dispatcharr?.url.origin ?? "not configured"}`);
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/")) void listener(req, res);
        else next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), podiumProxy(env)],
    define: { __APP_VERSION__: JSON.stringify(version) },
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    server: { port: 5173 },
  };
});
