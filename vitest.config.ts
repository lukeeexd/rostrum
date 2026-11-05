import path from "node:path";
import { defineConfig } from "vitest/config";
import { version } from "./package.json";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      { extends: true, test: { name: "server", include: ["server/**/*.test.ts", "scripts/**/*.test.ts"], environment: "node" } },
      {
        extends: true,
        test: {
          name: "web",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["src/test/setup.ts"],
        },
      },
    ],
  },
});
