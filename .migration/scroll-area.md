# scroll-area

2026-09-18, golden pair via CLI (`shadcn add scroll-area --overwrite`). Direct mapping (`Scrollbar`/`Thumb` renames only).

## Changed

- `src/app/components/ui/scroll-area.tsx` — CLI-delivered `base-mira` variant. Re-pointed `cn` import to `@/app/lib/utils`. Also removed two artifacts left by the CLI-delivered content itself (not something I introduced by hand-editing, but they broke the build so they're recorded here): an unused `import * as React from "react"` (`tsc -b` error `TS6133`, React 19 automatic JSX runtime doesn't need it) and a redundant `"use client"` directive (no RSC in this Vite app). Leftover scan clean.

## Left alone

Nothing else references `ScrollArea` internals directly.

## Behavior changes

None.

## Verify by hand

1. `GridlinesDialog.tsx`'s gridline list scrolls correctly when it overflows its fixed height, and the scrollbar thumb tracks drag.
