import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { THEME_COLOR } from "@/lib/themeColor";

export type ThemePref = "system" | "light" | "dark";

/** Must match the pre-paint script in public/theme-init.js. */
const KEY = "rostrum:theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export const resolveTheme = (pref: ThemePref, systemDark: boolean) =>
  pref === "dark" || (pref === "system" && systemDark) ? "dark" : "light";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

interface ThemeValue {
  pref: ThemePref;
  resolved: "light" | "dark";
  setPref: (pref: ThemePref) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** System preference by default; an explicit choice is remembered per browser. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const onChange = () => setSystemDark(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(pref, systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    // Both tags (light/dark media) take the chosen theme, so a manual switch wins over the OS.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", THEME_COLOR[resolved]);
  }, [resolved]);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  }, []);

  return <ThemeContext.Provider value={{ pref, resolved, setPref }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme outside ThemeProvider");
  return value;
}
