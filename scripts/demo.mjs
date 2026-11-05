// Bundles and runs the demo (scripts/demo/main.ts): Rostrum against a
// made-up Podium with a week of made-up history. Usage: npm run demo
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = "node_modules/.cache/rostrum-demo/main.mjs";
await build({
  entryPoints: ["scripts/demo/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile,
  define: { __APP_VERSION__: JSON.stringify("demo") },
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
  logLevel: "warning",
});
await import(pathToFileURL(outfile).href);
