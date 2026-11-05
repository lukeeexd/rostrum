// Applies the theme before first paint so there is no light flash. Loaded
// synchronously from <head>; a file rather than inline so the CSP can stay
// script-src 'self'. Must match src/hooks/useTheme.tsx (key + "system" default).
(function () {
  try {
    var pref = localStorage.getItem("rostrum:theme");
    var dark = pref === "dark" || (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
