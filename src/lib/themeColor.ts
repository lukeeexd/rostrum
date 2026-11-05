/**
 * The page background (--color-background-full) in each theme, which also
 * colours an installed app's title/status bar. index.html, the manifest and
 * public/theme-init.js repeat these (they cannot import); server/manifest.test.ts
 * checks they agree.
 */
export const THEME_COLOR = { light: "#ffffff", dark: "#121212" } as const;
