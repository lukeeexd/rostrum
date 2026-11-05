import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { THEME_COLOR } from "../src/lib/themeColor";
import { createApp } from "./app";
import { parseConfig } from "./config";

/**
 * The install manifest and its icons, served from public/ the way the built
 * app serves them from dist/ (Vite copies public/ across unchanged).
 */
const app = createApp(parseConfig({ PODIUM_URL: "http://192.168.1.10:3456" }), "public", vi.fn() as unknown as typeof fetch);
const get = (p: string) => app.request(p, { headers: { host: "192.168.1.10:8080" } });
const html = readFileSync("index.html", "utf8");

interface Manifest {
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; purpose: string }[];
  shortcuts: { name: string; url: string }[];
}
const manifest = async () => (await (await get("/manifest.webmanifest")).json()) as Manifest;

/** A PNG's "WxH", from its IHDR chunk; null when it is not a PNG. */
function pngSize(bytes: ArrayBuffer): string | null {
  const view = new DataView(bytes);
  return view.getUint32(0) === 0x89504e47 ? `${view.getUint32(16)}x${view.getUint32(20)}` : null;
}

describe("install manifest", () => {
  it("is served as a manifest, revalidated so changes reach installed apps", async () => {
    const res = await get("/manifest.webmanifest");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/manifest\+json/);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("lists icons that exist at the size it says, one of them maskable", async () => {
    const { icons } = await manifest();
    // iOS ignores the manifest's icons and takes this one from index.html.
    for (const icon of [...icons, { src: "/apple-touch-icon.png", sizes: "180x180" }]) {
      const res = await get(icon.src);
      expect(res.status, icon.src).toBe(200);
      expect(res.headers.get("content-type"), icon.src).toBe("image/png");
      expect(pngSize(await res.arrayBuffer()), icon.src).toBe(icon.sizes);
    }
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("has shortcuts only to pages that exist", async () => {
    const routes = [...readFileSync("src/app/router.tsx", "utf8").matchAll(/path: "([a-z-]+)"/g)].map((m) => `/${m[1]}`);
    expect(routes).toContain("/live"); // the route list was read at all
    const { shortcuts } = await manifest();
    expect(shortcuts.length).toBeGreaterThan(0);
    for (const s of shortcuts) expect(routes, s.name).toContain(s.url);
  });

  it("is linked from the page with credentials (it still loads behind basic auth), with the iOS icon", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  });
});

describe("theme colours", () => {
  it("agree everywhere they are repeated", async () => {
    const { light, dark } = THEME_COLOR;
    expect(html).toContain(`<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)" />`);
    expect(html).toContain(`<meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)" />`);
    expect(readFileSync("public/theme-init.js", "utf8")).toContain(`dark ? "${dark}" : "${light}"`);
    // A manifest has one colour: the light one (the page's tags take over once it loads).
    expect(await manifest()).toMatchObject({ theme_color: light, background_color: light });
  });
});
