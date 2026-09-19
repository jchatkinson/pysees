# tabs

2026-09-18, golden pair via CLI (`shadcn add tabs --overwrite`). Direct mapping (`Trigger` -> `Tab`, `Content` -> `Panel`).

## Changed

- `src/app/components/ui/tabs.tsx` — CLI-delivered `base-mira` variant. Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.

## Left alone

- No consumer in this app currently uses `Tabs` (grepped `<Tabs` outside `ui/` and `component-example.tsx` — the only usage is the unused scaffold file). Nothing to sweep at call sites.
- Pre-existing `react-refresh/only-export-components` ESLint error at line 79 — confirmed identical on the original committed file.

## Behavior changes

- **Flag**: Radix required an explicit `activationMode="manual"` for manual tab activation; Base UI's `Tabs` defaults to manual activation always. Not exercised anywhere in this app today, but worth knowing if `Tabs` is adopted later with keyboard-heavy navigation in mind.

## Verify by hand

Not currently wired into any app screen — nothing to click-test today. If `Tabs` is adopted later, verify arrow-key navigation doesn't auto-select a panel on focus (manual-activation default).
