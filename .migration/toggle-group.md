# toggle-group

2026-09-18, golden pair via CLI (`shadcn add toggle-group --overwrite`, migrated after `toggle` since it imports `toggleVariants` from it). Direct mapping (group items reuse the `Toggle` primitive).

## Changed

- `src/app/components/ui/toggle-group.tsx` — CLI-delivered `base-mira` variant. Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- `src/app/components/ui/toggle.tsx` was re-delivered as part of this same `add` call (dependency); no additional change beyond what's already recorded in `toggle.md`.

## Left alone

No consumer in this app currently renders `<ToggleGroup>` (grepped `<ToggleGroup` app-wide — no matches outside `ui/`). Nothing to sweep at call sites.

## Behavior changes

- **Flag**: Radix's `type="single" | "multiple"` -> Base UI's `multiple` boolean (value shape becomes arrays either way). Not used anywhere in this app today.
- **Flag**: `rovingFocus={false}` dropped (roving focus always on); `loop` -> `loopFocus`. Not used anywhere in this app today.

## Verify by hand

Not currently wired into any app screen — nothing to click-test today. If adopted later, verify keyboard arrow navigation between items and that the selected-item styling still applies via `data-pressed`/equivalent state.
