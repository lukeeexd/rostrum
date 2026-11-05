import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script, untyped
import { createAnonymiser, plainStreamName } from "./anonymise.mjs";

describe("plainStreamName", () => {
  it.each([
    ["VIP: ARENA SPORTS MAIN EVENT ᴴᴰ", "Arena Sports Main Event"],
    ["UK: ARENA SPORTS 6 ᴴᴰ ʰᵉᵛᶜ", "Arena Sports 6"],
    ["163 Lumen One HD", "Lumen One HD"],
    ["UK: NORTHGATE NEWS LONDON 4K ◉", "Northgate News London 4K"],
    ["Lumen One HD", "Lumen One HD"],
  ])("%s → %s", (raw, plain) => expect(plainStreamName(raw)).toBe(plain));
});

describe("createAnonymiser", () => {
  it("maps providers, their groups, channels and streams everywhere, and refuses a file that still names a provider", () => {
    const a = createAnonymiser();
    a.learn({ providers: [{ name: "Acme IPTV" }, { name: "Zed" }] });
    const out = a.json({
      providers: [{ name: "Acme IPTV", profiles: [{ name: "Acme IPTV Default" }] }],
      groups: [{ id: 1, name: "Events | Football", rows: [{ id: 9, name: "Rovers v United", tvgId: "guide-event-1", aliases: ["ROVERS V UNITED ᴴᴰ"] }] }],
      currentOrder: [{ raw: "VIP: NEWS ONE ᴴᴰ", normalized: "News One", provider: "ZED", providerGroup: "UK| NEWS ᴿᴬᵂ", prefixes: ["UK"] }],
      entries: [{ streamId: 1, name: "UK: NEWS ONE HD ◉", provider: "Acme IPTV", error: "acme iptv refused", channels: [{ id: 9, name: "Rovers v United" }] }],
      lanes: [{ name: "Zed", current: ["News One SD"] }],
      found: [{ providers: ["Zed"], samples: ["UK: NEWS ONE ◉"] }],
      query: "news one",
    });
    expect(out.providers[0]).toEqual({ name: "Provider A", profiles: [{ name: "Provider A Default" }] });
    expect(out.groups[0]).toEqual({ id: 1, name: "Category 1", rows: [{ id: 9, name: "Title 1", tvgId: "tvg-1", aliases: ["Title 1"] }] }); // a superscript ᴴᴰ is a decoration, not a tag
    // One programme, one title: the stream names, its normalised name and the search term all agree.
    expect(out.currentOrder[0]).toEqual({ raw: "Title 2", normalized: "Title 2", provider: "Provider B", providerGroup: "Group 1", prefixes: ["Prefix 1"] });
    expect(out.entries[0]).toMatchObject({ name: "Title 2 HD", provider: "Provider A", error: "Provider A refused", channels: [{ name: "Title 1" }] });
    expect(out.lanes[0]).toEqual({ name: "Provider B", current: ["Title 2 SD"] });
    expect(out.found[0]).toEqual({ providers: ["Provider B"], samples: ["Title 2"] });
    expect(out.query).toBe("Title 2");
    const text = JSON.stringify(out);
    expect(() => a.assertClean("ok", text)).not.toThrow();
    expect(() => a.assertClean("leaky", text + " ZED")).toThrow(/provider name/);
    expect(a.metrics('podium_provider_score{provider="Zed",stat="median"} 0.5')).toBe('podium_provider_score{provider="Provider B",stat="median"} 0.5');
  });

  it("catches a name hidden by JSON escaping, and maps one used as a key", () => {
    const a = createAnonymiser();
    a.learn({ providers: [{ name: 'Say "Hi" TV' }] });
    expect(() => a.assertClean("escaped", JSON.stringify({ note: 'from Say "Hi" TV' }))).toThrow(/provider name/);
    expect(a.json({ byProvider: { 'Say "Hi" TV': 3 } })).toEqual({ byProvider: { "Provider A": 3 } });
  });

  it("leaves already-anonymous data as it is", () => {
    const a = createAnonymiser();
    a.learn({ providers: [{ name: "Provider A" }] });
    const text = JSON.stringify(a.json({ providers: [{ name: "Provider A" }], rows: [{ name: "Title 3 HD" }] }));
    expect(text).toBe('{"providers":[{"name":"Provider A"}],"rows":[{"name":"Title 3 HD"}]}');
    expect(() => a.assertClean("again", text)).not.toThrow();
  });
});
