# badge

2026-09-18, golden pair via CLI (`shadcn add badge --overwrite`). Leaf component, no other ui-wrapper dependents. One-line verdict: clean, no consumer call-site changes needed.

## Changed

- `src/app/components/ui/badge.tsx` — CLI-delivered `base-mira` variant (badge has no Radix-specific primitive to begin with; it's a `useRender`/`Slot` polymorphic span in both variants). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.

## Left alone

- Pre-existing `react-refresh/only-export-components` ESLint error at line 51 (exports `badgeVariants` alongside the component) — confirmed identical on the original committed file, not introduced by this migration.

## Behavior changes

None.

## Verify by hand

1. `Badge` usages (e.g. `component-example.tsx`'s "Updates" badge) still render with correct variant colors.
