// Snapshots Podium's read endpoints into src/test/fixtures/ so tests run
// against real response shapes. Usage: npm run capture-fixtures
// (reads PODIUM_URL / PODIUM_TOKEN; set CAPTURE_CHANNEL_ID to pick the preview channel and
// CAPTURE_SEARCH the catalogue search term).
//
// Scrubbing: every URL becomes http://podium.example, and provider profile
// search/replace patterns (which can embed a login) are blanked. Provider
// names, provider group names and provider-style stream names are
// anonymised (scripts/anonymise.mjs), and a file that still holds a real
// provider name is not written. Channel names are the install's own and are
// kept; review the files before committing all the same.
import { writeFile } from "node:fs/promises";
import { createAnonymiser } from "./anonymise.mjs";

const base = (process.env.PODIUM_URL ?? "").replace(/\/+$/, "");
if (!base) {
  console.error("Set PODIUM_URL");
  process.exit(1);
}
const headers = { accept: "application/json" };
if (process.env.PODIUM_TOKEN) headers.authorization = `Bearer ${process.env.PODIUM_TOKEN}`;

/** Keys whose values are patterns or URLs by nature; blanked whatever they hold. */
const SENSITIVE_KEYS = /^(searchPattern|replacePattern|url|callbackUrl|stream_hash|.*(token|password|secret|api_?key).*)$/i;

const scrubString = (s) =>
  s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "http://podium.example") // any scheme, not just http(s)
    .replace(/[^\s"'<>/@:]+:[^\s"'<>/@]+@(?=[\w.-])/g, "") // user:pass@host
    .replace(/([?&;](?:user(?:name)?|pass(?:word)?|pwd|token|api_?key|key)=)[^&\s"'<>]+/gi, "$1x")
    .replace(/\/(live|movie|series|timeshift)\/[^/\s"'<>]+\/[^/\s"'<>]+\//gi, "/$1/user/pass/");

/** One for the whole capture, so a provider maps to the same letter in every file. */
const anonymiser = createAnonymiser();

const blank = (body) =>
  JSON.parse(
    JSON.stringify(body, (key, value) =>
      SENSITIVE_KEYS.test(key) && value != null ? "<scrubbed>" : typeof value === "string" ? scrubString(value) : value,
    ),
  );
const scrub = (body) => JSON.stringify(anonymiser.json(blank(body)), null, 2);

/** Anything that still looks like a credential after scrubbing stops the capture. */
const SUSPICIOUS = [/[?&](username|password|token)=(?!x\b)/i, /[^\s"'<>/@:]+:[^\s"'<>/@]+@[\w.-]/, /\/live\/(?!user\/pass\/)[^/\s"]+\/[^/\s"]+\//i];

async function save(name, body) {
  const text = scrub(body);
  const hit = SUSPICIOUS.find((re) => re.test(text));
  if (hit) throw new Error(`${name}.json still looks like it holds a credential (${hit}); not written`);
  anonymiser.assertClean(`${name}.json`, text);
  await writeFile(new URL(`../src/test/fixtures/${name}.json`, import.meta.url), text + "\n");
  console.log(`-> ${name}.json`);
}

async function call(path, init = {}) {
  const res = await fetch(base + path, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Learn the provider names before writing anything, so their letters follow Podium's own order.
anonymiser.learn(await call("/api/state"));

for (const [name, path] of [
  ["health", "/api/health"],
  ["stats", "/api/stats"],
  ["progress", "/api/progress"],
  ["dead", "/api/dead"],
  ["connect", "/api/connect/status"],
]) {
  await save(name, await call(path));
}

// Channels page inputs. /api/state is the cached snapshot (never ?refresh=1);
// /api/preview is read-only despite being a POST.
const state = await call("/api/state");
await save("podium-state", state);
const preview = (channelId) =>
  call("/api/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channelId }),
  });
// The tests want a channel whose streams Podium has actually probed (event
// channels often have none yet), so take the first with at least three.
const candidates = process.env.CAPTURE_CHANNEL_ID
  ? [Number(process.env.CAPTURE_CHANNEL_ID)]
  : state.groups.flatMap((g) => g.rows ?? []).filter((c) => (c.assigned ?? 0) >= 3).map((c) => c.id);
for (const channelId of candidates.slice(0, 40)) {
  const p = await preview(channelId);
  if ((p.currentOrder ?? []).filter((s) => s.lastProbedAt != null).length >= 3) {
    await save("podium-preview", p);
    break;
  }
}

// Streams page: Podium's catalogue search (read-only).
// CAPTURE_SEARCH picks the term (anonymised on the way in, like everything else).
await save("podium-streams", await call(`/api/streams?q=${encodeURIComponent(process.env.CAPTURE_SEARCH ?? "news")}&limit=200`));

// Providers page: only the per-provider series of the Prometheus text (the
// per-channel ones carry channel names and are not needed).
const metrics = await fetch(base + "/api/metrics", { headers });
if (!metrics.ok) throw new Error(`/api/metrics -> ${metrics.status}`);
const providerLines = (await metrics.text())
  .split("\n")
  .filter((l) => /^(# (HELP|TYPE) )?podium_provider_/.test(l))
  .map(scrubString)
  .join("\n");
const metricsText = anonymiser.metrics(providerLines) + "\n";
anonymiser.assertClean("podium-metrics.txt", metricsText);
await writeFile(new URL("../src/test/fixtures/podium-metrics.txt", import.meta.url), metricsText);
console.log("-> podium-metrics.txt");
