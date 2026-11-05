// Bundles server/index.ts into dist-server/index.js with Rostrum's version
// baked in, so the image needs no node_modules and /healthz can report it.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: "dist-server/index.js",
  define: { __APP_VERSION__: JSON.stringify(version) },
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
  logLevel: "info",
});
