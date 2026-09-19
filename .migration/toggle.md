# toggle

2026-09-18, golden pair via CLI (`shadcn add toggle --overwrite`, and re-delivered as a dependency of `toggle-group`). Direct mapping (callable primitive).

## Changed

- `src/app/components/ui/toggle.tsx` — CLI-delivered `base-mira` variant. Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.

## Left alone

- Pre-existing `react-refresh/only-export-components` ESLint error at line 42 (exports `toggleVariants`) — confirmed identical on the original committed file.

## Behavior changes

None observed for the standalone `Toggle`.

## Verify by hand

1. No standalone `<Toggle>` usage exists outside `toggle-group.tsx`'s reuse of `toggleVariants`; see `toggle-group.md` for the actual interactive check.
