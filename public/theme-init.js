// Applies the theme before first paint so there is no light flash. Loaded
// synchronously from <head>; a file rather than inline so the CSP can stay
// script-src 'self'. Must match src/hooks/useTheme.tsx (key, "system" default)
// and src/lib/themeColor.ts (an installed app's title bar).
(function () {
  try {
    var pref = localStorage.getItem("rostrum:theme");
    var dark = pref === "dark" || (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    var bars = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < bars.length; i++) bars[i].setAttribute("content", dark ? "#121212" : "#ffffff");
  } catch (e) {}
})();
