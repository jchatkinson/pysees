# alert-dialog

2026-09-18, golden pair via CLI (`shadcn add alert-dialog --overwrite`, migrated after `button`). Restructured (`Overlay` -> `Backdrop`, `Content` -> `Popup`, `Cancel` -> `Close`, `Action` has no Base UI primitive).

## Changed

- `src/app/components/ui/alert-dialog.tsx` — CLI-delivered `base-mira` variant. `AlertDialogAction` and `AlertDialogCancel` are still exported with their original names (the wrapper preserves the public API; `Action` renders a plain styled `<button>` internally since Base UI has no primitive for it, `Cancel` wraps `AlertDialog.Close`). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- `src/app/components/component-example.tsx` (unused scaffold file, only consumer in the app) — `<AlertDialogTrigger asChild><Button>...</Button></AlertDialogTrigger>` -> `render={<Button>...</Button>}`.

## Left alone

`AlertDialog` has exactly one consumer in the whole app (`component-example.tsx`, dead code, not imported anywhere) — no other call sites to sweep.

## Behavior changes

- Radix focuses `Cancel` by default on open; Base UI's `Popup` focuses the first tabbable element instead unless `initialFocus` is set explicitly. Not overridden in this wrapper — if `AlertDialog` gets a real consumer later, worth setting `initialFocus` on the Cancel button to restore the old default-focus behavior.

## Verify by hand

Not currently wired into any real app screen (`component-example.tsx` is dead code) — nothing to click-test today. If `AlertDialog` is adopted for a real confirmation flow later, verify: opening focuses a sensible default control, `Action` actually closes the dialog after running its callback (it has no built-in close behavior, unlike Radix's `Action` which also didn't auto-close — same as before), and `Cancel` closes without side effects.
