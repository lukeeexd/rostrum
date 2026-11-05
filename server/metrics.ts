/**
 * A small reader for the Prometheus text exposition format, enough for
 * Podium's /api/metrics: `name{label="value",…} number`. Comments, blank
 * lines and malformed lines are skipped.
 */
export interface Sample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)/;
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

const unescape = (v: string) => v.replace(/\\(["\\n])/g, (_m, c: string) => (c === "n" ? "\n" : c));

export function parsePrometheus(text: string): Sample[] {
  const samples: Sample[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    const labels: Record<string, string> = {};
    for (const [, key, raw] of (m[2] ?? "").matchAll(LABEL)) labels[key] = unescape(raw);
    samples.push({ name: m[1], labels, value });
  }
  return samples;
}
