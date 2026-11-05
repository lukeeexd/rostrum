import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_COLOR } from "@/lib/themeColor";
import { ThemeProvider, useTheme } from "./useTheme";

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
const bars = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content"));

describe("useTheme and an installed app's title bar", () => {
  beforeEach(() => {
    // jsdom has no matchMedia; this OS is in light mode.
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    // As index.html has them: one per OS scheme.
    for (const [media, color] of [["light", THEME_COLOR.light], ["dark", THEME_COLOR.dark]]) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = color;
      meta.media = `(prefers-color-scheme: ${media})`;
      document.head.append(meta);
    }
  });
  afterEach(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("colours both tags with the chosen theme, whatever the OS says", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPref("dark"));
    expect(bars()).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);
    act(() => result.current.setPref("light"));
    expect(bars()).toEqual([THEME_COLOR.light, THEME_COLOR.light]);
  });
});
