// Replaces everything in captured Podium responses that identifies an
// install, so fixtures are safe to commit and publish. Within one capture the
// same real value always maps to the same stand-in, so fixtures stay
// consistent with each other:
//
//   provider names          -> "Provider A", "Provider B", …
//   provider group names    -> "Group 1", "Group 2", …
//   channel groups          -> "Category 1", "Category 2", …
//   channel, stream and event names, aliases and search terms
//                           -> "Title 1", "Title 1 HD", "Title 2 SD", … (one title per
//                              programme, so a channel and its streams still match; the
//                              quality tag is kept, provider decorations are dropped)
//   group filters, prefixes -> "Filter 1", "Prefix 1", …
//   guide (tvg) ids         -> "tvg-1", …
//
// Structural values (states, phases, codecs, error texts, ids, times) are
// kept. A file that still contains a real provider name, in any case or
// JSON-escaped, is refused.

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Quality tags kept on a stream name ("HD", "FHD 5.1", "4K"), as found at its end. */
const TAG = "(?:UHD|FHD|HD|SD|4K|8K|HEVC|RAW|50FPS|60FPS|5\\.1)";
const QUALITY = new RegExp(`\\s+(${TAG}(?:\\s+${TAG})*)$`, "i");

/** "VIP: ARENA SPORTS MAIN EVENT ᴴᴰ" -> "Arena Sports Main Event"; drops provider decorations. */
export function plainStreamName(raw) {
  let s = raw
    .replace(/[ʰ-˿ᴀ-ᶿ⁰-₟²³¹]+/g, " ") // superscript tags (ᴴᴰ ʰᵉᵛᶜ ⁶⁰ᶠᵖˢ ³⁸⁴⁰ᴾ)
    .replace(/[^\p{L}\p{N}&+.'()\-\s]/gu, " ") // ◉, |, :, and other markers
    .replace(/^\s*(\d+\s+)+/, "") // leading channel numbers ("163 Lumen One HD")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^((VIP|UK|IE|US|USA|CA|AU|NZ|DE|FR|EU|EN|INTL)\s+)+/i, ""); // provider prefixes ahead of the name
  if (s === s.toUpperCase()) {
    s = s
      .toLowerCase()
      .replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a.toUpperCase() + b)
      .replace(/\b(Hd|Fhd|Uhd|Sd|4k|8k|Hevc|Raw)\b/g, (w) => w.toUpperCase());
  }
  return s || "Stream";
}

/** A name's programme and its quality tag: "Lumen One HD" -> { base: "lumen one", tag: "HD" }. */
function splitTitle(name) {
  const plain = plainStreamName(name);
  const m = plain.match(QUALITY);
  const tag = m ? m[1].toUpperCase() : "";
  const base = (m ? plain.slice(0, m.index) : plain).toLowerCase().replace(/\s+/g, " ").trim();
  return { base: base || plain.toLowerCase(), tag };
}

export function createAnonymiser() {
  /** A real -> stand-in table that never maps a stand-in again (a second pass over clean data). */
  const table = (make) => {
    const real = new Map();
    const aliases = new Set();
    const get = (key) => {
      if (aliases.has(key)) return key;
      if (!real.has(key)) {
        const alias = make(real.size);
        real.set(key, alias);
        aliases.add(alias);
      }
      return real.get(key);
    };
    return { get, real, aliases };
  };
  const providers = table((n) => `Provider ${LETTERS[n] ?? n + 1}`);
  const providerGroups = table((n) => `Group ${n + 1}`);
  const categories = table((n) => `Category ${n + 1}`);
  const titles = table((n) => `Title ${n + 1}`);
  const filters = table((n) => `Filter ${n + 1}`);
  const prefixes = table((n) => `Prefix ${n + 1}`);
  const tvgIds = table((n) => `tvg-${n + 1}`);

  // Provider names are matched case-insensitively: "ACME TV" is the same provider as "Acme TV".
  const byLower = new Map();
  const provider = (name) => {
    if (providers.aliases.has(name)) return name;
    const k = name.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, name);
    return providers.get(byLower.get(k));
  };

  /** A channel, stream or event name, mapped by its programme; the quality tag stays. */
  const title = (name) => {
    if (/^Title \d+( |$)/.test(name)) return name;
    const { base, tag } = splitTitle(name);
    const alias = titles.get(base);
    return tag ? `${alias} ${tag}` : alias;
  };

  /** Learns provider names up front from a Podium /api/state, so their letters follow Podium's own order. */
  function learn(state) {
    for (const p of state?.providers ?? []) if (typeof p?.name === "string") provider(p.name);
    for (const name of Object.values(state?.providerNames ?? {})) if (typeof name === "string") provider(name);
  }

  const realProviders = () => [...providers.real.keys()].filter((r) => !providers.aliases.has(r));
  const nameRegex = (real, flags) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(real)}(?![\\p{L}\\p{N}])`, flags);

  /** Any provider name still inside a string (a profile name "Acme TV Default", an error) is replaced, in any case. */
  function replaceNames(s) {
    let out = s;
    for (const real of realProviders().sort((a, b) => b.length - a.length)) out = out.replace(nameRegex(real, "giu"), providers.get(real));
    return out;
  }

  /** Keys whose string values (or string arrays) are channel, stream or event names. */
  const TITLE_KEYS = new Set(["aliases", "normalized", "raw", "samples", "contains", "exclude", "query", "channelName", "current"]);
  /** Keys whose values are provider-group filters. */
  const FILTER_KEYS = new Set(["includeGroups", "excludeGroups"]);
  /** Objects keyed by alias (alias -> filters): their keys are names too. */
  const KEYED_BY_TITLE = new Set(["aliasGroupFilters", "aliasProviders", "aliasProviderGroupFilters", "containsGroupFilters"]);

  /**
   * A JSON body, walked: every name-bearing field by its key and by what it
   * sits in (`within`, the key of the object or array holding it); every
   * other string, and every object key, checked for provider names.
   */
  function json(body) {
    const walk = (value, key, parent, within) => {
      if (Array.isArray(value)) return value.map((v) => walk(v, key, parent, within));
      if (value && typeof value === "object") {
        const keyedByTitle = KEYED_BY_TITLE.has(key);
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [keyedByTitle ? title(k) : replaceNames(k), walk(v, k, value, key)]));
      }
      if (typeof value !== "string") return value;
      if (key === "provider" || (key === "providers" && Array.isArray(parent?.providers))) return provider(value);
      if (key === "providerGroup") return providerGroups.get(value);
      if (key === "tvgId") return value ? tvgIds.get(value) : value;
      if (key === "prefixes" || (key === "name" && within === "sections")) return prefixes.get(value);
      if (FILTER_KEYS.has(key)) return filters.get(value);
      if (TITLE_KEYS.has(key)) return title(value);
      if (key === "pattern") return value.replace(/^[^|*]+(?=\|)/, (c) => `${categories.get(c.trim())} `);
      if (key === "name" && parent) {
        if (within === "providers" || within === "lanes") return provider(value); // provider objects, and the pass's provider lanes
        if (within === "providerGroups") return providerGroups.get(value);
        if (within === "profiles") return replaceNames(value);
        if (within === "groups" && ("rows" in parent || "channels" in parent)) return categories.get(value); // a channel group
        return title(value); // a channel, a stream, an event
      }
      return replaceNames(value);
    };
    const out = walk(body);
    if (out?.providerNames) out.providerNames = Object.fromEntries(Object.entries(out.providerNames).map(([k, v]) => [k, provider(v)]));
    return out;
  }

  /** Prometheus text: provider labels, and any provider name left in it. */
  function metrics(text) {
    for (const m of text.matchAll(/provider="([^"]*)"/g)) provider(m[1]);
    return replaceNames(text.replace(/provider="([^"]*)"/g, (_, name) => `provider="${provider(name)}"`));
  }

  /** Fails if a real provider name survived anywhere in `text`: in any case, or JSON-escaped. */
  function assertClean(label, text) {
    for (const real of realProviders()) {
      const forms = [real, JSON.stringify(real).slice(1, -1)];
      if (forms.some((f) => nameRegex(f, "iu").test(text))) throw new Error(`${label} still contains a provider name; not written`);
    }
  }

  return { learn, json, metrics, assertClean, providers: providers.real };
}
