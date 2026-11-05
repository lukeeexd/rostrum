# Vendored BoardUI

Copied from https://github.com/BoardUI/boardui (MIT), commit
`ec5c5eb3e29c2441be63b9422cd54f411ef23466` (2026-10-03).

Files are copied verbatim, except that imports were rewritten from `@/components/foundations/direction/direction` to `@/components/ui/foundations/direction` and from
`@/components/base/*` to `@/components/ui/*`. Stylesheets live in
`src/styles/` (globals, theme, typography) and helpers in `src/utils/`.

To update: re-copy the same paths from a newer BoardUI commit, re-apply the
import rewrite, and bump the commit above. Anything Rostrum-specific belongs
in `src/components/shared/`, never in here.
