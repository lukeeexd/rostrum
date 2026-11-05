import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("normalises PODIUM_URL to its origin and defaults the rest", () => {
    const c = parseConfig({ PODIUM_URL: " http://192.168.1.10:3456/ " });
    expect(c.upstream.href).toBe("http://192.168.1.10:3456/");
    expect(c.port).toBe(8080);
    expect(c.token).toBeUndefined();
    expect(c.allowedHosts).toEqual([]);
  });

  it("reads token, port and allowed hosts", () => {
    const c = parseConfig({
      PODIUM_URL: "https://podium.lan",
      PODIUM_TOKEN: " t ",
      PORT: "9000",
      ROSTRUM_ALLOWED_HOSTS: "a.example, .b.example  *.c.example",
    });
    expect(c).toMatchObject({ token: "t", port: 9000, allowedHosts: ["a.example", ".b.example", "*.c.example"] });
  });

  it("leaves Dispatcharr off unless both settings are given", () => {
    expect(parseConfig({ PODIUM_URL: "http://p.lan" }).dispatcharr).toBeUndefined();
    const c = parseConfig({ PODIUM_URL: "http://p.lan", DISPATCHARR_URL: "http://d.lan:9191/", DISPATCHARR_API_KEY: " k " });
    expect(c.dispatcharr?.url.href).toBe("http://d.lan:9191/");
    expect(c.dispatcharr?.apiKey).toBe("k");
  });

  it.each([
    [{ PODIUM_URL: "http://p.lan", DISPATCHARR_URL: "http://d.lan" }, /both/],
    [{ PODIUM_URL: "http://p.lan", DISPATCHARR_API_KEY: "k" }, /both/],
    [{ PODIUM_URL: "http://p.lan", DISPATCHARR_URL: "http://d.lan/api", DISPATCHARR_API_KEY: "k" }, /DISPATCHARR_URL must be just the origin/],
  ])("rejects a half or bad Dispatcharr config %o", (env, message) => {
    expect(() => parseConfig(env)).toThrow(message);
  });

  it("never echoes a URL that could carry a login", () => {
    expect(() => parseConfig({ PODIUM_URL: "ftp://u:secret@p.lan" })).toThrow(/^(?!.*secret)/);
    let message = "";
    try {
      parseConfig({ PODIUM_URL: "http://u:secret@p.lan/path" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/without a path/);
    expect(message).not.toContain("secret");
  });

  it.each([
    [{}, /required/],
    [{ PODIUM_URL: "not a url" }, /not a valid URL/],
    [{ PODIUM_URL: "ftp://x" }, /http\(s\)/],
    [{ PODIUM_URL: "http://x:3456/podium" }, /without a path/],
    [{ PODIUM_URL: "http://x", PORT: "0" }, /PORT/],
  ])("rejects %o", (env, message) => {
    expect(() => parseConfig(env)).toThrow(message);
  });
});

describe("ROSTRUM_ALLOWED_HOSTS", () => {
  it("accepts URLs and names alike", () => {
    const c = parseConfig({ PODIUM_URL: "http://p.lan", ROSTRUM_ALLOWED_HOSTS: "https://rostrum.example.com/, other.example:443" });
    expect(c.allowedHosts).toEqual(["rostrum.example.com", "other.example"]);
  });
});
