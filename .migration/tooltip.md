# tooltip

2026-09-18, golden pair via CLI (`shadcn add tooltip --overwrite`). Positioner model (`Portal > Positioner > Popup`); delay control moves from `Provider.delayDuration` to `Trigger.delay`.

## Changed

- `src/app/components/ui/tooltip.tsx` — CLI-delivered `base-mira` variant (`TooltipProvider` now defaults `delay={0}`, `TooltipContent` composes `Portal > Positioner > Popup > Arrow`). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- Every consumer using `<TooltipTrigger asChild>...</TooltipTrigger>` had to move to `render`:
  - `src/app/components/ActionBar.tsx` (4 triggers: zoom in/out, fit, perspective toggle)
  - `src/app/components/SchemaFormField.tsx` (2 triggers: the info-icon buttons on `FieldLabel` and the flag-arg tooltip)

## Left alone

`AppShell`/`App.tsx` already wrapped the app in `<TooltipProvider>` before this migration (Base UI's `Tooltip` still requires a `Provider` ancestor for shared delay timing) — no change needed there.

## Behavior changes

- **Flag**: `disableHoverableContent` (Radix) has no direct Provider-level Base UI equivalent (moved to per-Root `disableHoverablePopup`); not used anywhere in this app.
- Default open delay changed from Radix's 700ms to Base UI's Trigger default 600ms (this app's `TooltipProvider` explicitly sets `delay={0}` already, so this default doesn't actually apply here — no observable change).

## Verify by hand

1. Hover each action-bar icon button (zoom in/out, fit, perspective) — tooltip text appears near-instantly (given `delay={0}`) and the underlying button's `onClick` still fires on click, not just hover.
2. Hover the info (circle-help) icons next to command-form field labels — tooltip shows the field description.
