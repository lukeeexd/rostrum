import { describe, expect, it } from "vitest";
import { isAllowedHost, normaliseHostEntry } from "./hosts";

describe("isAllowedHost", () => {
  it.each([
    "localhost",
    "localhost:8080",
    "app.localhost",
    "127.0.0.1:8080",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10:8080",
    "169.254.10.10",
    "[::1]:8080",
    "[fd12:3456::1]",
    "[fe80::1]",
    "rostrum",
    "rostrum:8080",
    "nas.lan",
    "rostrum.local:8080",
    "box.home.arpa",
    "rostrum.tail1234.ts.net",
    "NAS.LAN",
  ])("allows private host %s", (host) => expect(isAllowedHost(host, [])).toBe(true));

  it.each([
    "evil.example",
    "evil.example:8080",
    "8.8.8.8",
    "172.32.0.1",
    "192.169.1.1",
    "[2001:db8::1]",
    "lan.evil.example",
    "localhost.evil.example",
  ])("refuses public host %s", (host) => expect(isAllowedHost(host, [])).toBe(false));

  it("allows a missing Host header, as Podium does", () => {
    expect(isAllowedHost(undefined, [])).toBe(true);
  });

  it("honours ROSTRUM_ALLOWED_HOSTS entries: exact, suffix and wildcard", () => {
    expect(isAllowedHost("rostrum.example.com", ["rostrum.example.com"])).toBe(true);
    expect(isAllowedHost("a.example.org:443", [".example.org"])).toBe(true);
    expect(isAllowedHost("a.b.example.net", ["*.example.net"])).toBe(true);
    expect(isAllowedHost("example.net", ["*.example.net"])).toBe(false);
    expect(isAllowedHost("anything.example", ["*"])).toBe(true);
    expect(isAllowedHost("other.example", ["rostrum.example.com"])).toBe(false);
  });
});

describe("normaliseHostEntry", () => {
  it.each([
    ["rostrum.example.com", "rostrum.example.com"],
    ["https://rostrum.example.com", "rostrum.example.com"],
    ["https://Rostrum.Example.Com/", "rostrum.example.com"],
    ["http://rostrum.example.com:8443/live?x=1", "rostrum.example.com"],
    ["rostrum.example.com:443", "rostrum.example.com"],
    ["*.example.com", "*.example.com"],
    [".example.com", ".example.com"],
    ["https://[2001:db8::1]:8080/", "2001:db8::1"],
    ["*", "*"],
    ["  ", ""],
  ])("%s → %s", (entry, out) => expect(normaliseHostEntry(entry)).toBe(out));
});
