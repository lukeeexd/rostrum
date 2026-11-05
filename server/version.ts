/**
 * Rostrum's version: baked in as __APP_VERSION__ by scripts/build-server.mjs
 * (declared in src/globals.d.ts, shared with the client build). In dev and
 * tests the identifier is not defined, and npm provides the package version.
 */
export const VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : (process.env.npm_package_version ?? "dev");
