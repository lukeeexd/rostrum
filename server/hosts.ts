import { isIP } from "node:net";

/**
 * DNS-rebinding guard, mirroring Podium's: a page on some public domain can
 * re-point that domain at Rostrum's LAN address and then talk to it as
 * "same-origin". Such requests still carry the public name in Host, so only
 * private addresses and LAN-style names are answered, plus anything listed in
 * ROSTRUM_ALLOWED_HOSTS.
 */

const LAN_SUFFIXES = [".lan", ".local", ".home.arpa", ".ts.net", ".localhost"];

/** "host:port" / "[v6]:port" → bare lowercase host. */
function hostname(header: string): string {
  const h = header.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(1, h.indexOf("]"));
  const colon = h.lastIndexOf(":");
  return colon === -1 ? h : h.slice(0, colon);
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function isPrivateIPv6(ip: string): boolean {
  if (ip === "::1") return true;
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 /* fc00::/7 */ || (first & 0xffc0) === 0xfe80; /* fe80::/10 */
}

/**
 * An allowed-hosts entry as the bare name the Host header is compared with.
 * People paste URLs ("https://rostrum.example.com/"), so scheme, login, port
 * and path are dropped; a leading "*." or "." (subdomain match) is kept.
 */
export function normaliseHostEntry(entry: string): string {
  let e = entry.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  e = e.replace(/[/?#].*$/, "").replace(/^[^@]*@/, "");
  if (e.startsWith("[")) return e.slice(1, e.indexOf("]") > 0 ? e.indexOf("]") : undefined);
  return e.replace(/:\d*$/, "");
}

function matchesEntry(host: string, entry: string): boolean {
  const e = entry.trim().toLowerCase();
  if (!e) return false;
  if (e === "*") return true;
  if (e.startsWith("*.")) return host.endsWith(e.slice(1));
  if (e.startsWith(".")) return host.endsWith(e);
  return host === e;
}

export function isAllowedHost(header: string | undefined, extra: readonly string[]): boolean {
  if (!header) return true;
  const host = hostname(header);
  const ip = isIP(host);
  if (ip === 4) return isPrivateIPv4(host) || extra.some((e) => matchesEntry(host, e));
  if (ip === 6) return isPrivateIPv6(host) || extra.some((e) => matchesEntry(host, e));
  return (
    host === "localhost" ||
    !host.includes(".") ||
    LAN_SUFFIXES.some((s) => host.endsWith(s)) ||
    extra.some((e) => matchesEntry(host, e))
  );
}
