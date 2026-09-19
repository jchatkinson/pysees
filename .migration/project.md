# project

2026-09-18. Whole-project migration, Radix UI -> Base UI. Strategy: golden pair via the shadcn CLI for all 14 wrappers (`shadcn add <component> --overwrite`), then a hand sweep of every consumer in `src/` against `consumer-props.md`. Verdict: build/lint/grep-clean, but one real functional regression slipped past all of that and only surfaced from user testing — see "Regression found after initial sign-off" below. Lesson: a clean build and a clean grep sweep are not the same as clicking every button.

## Preflight

- `npx shadcn@latest info --json` initially reported `"components": []` and resolved paths under `src/components/ui` / `src/lib` — **components.json's aliases were stale** (`@/components`, `@/lib/utils`, etc.), left over from before the project moved everything under `src/app/`. This predates the migration and wasn't something the earlier `shadcn apply --preset` step introduced (that step only touched `baseColor`/`menuColor`/`menuAccent`/CSS). Fixed the aliases to `@/app/components`, `@/app/lib/utils`, `@/app/lib`, `@/app/components/ui`, `@/app/hooks` so the CLI could see and correctly target the real files. After the fix, `info --json` listed all 22 installed components under the right paths.
- Baseline build (`npm run build`, i.e. `tsc -b && vite build`) was green before any component was touched.
- **Important tooling note**: this repo's root `tsconfig.json` is solution-style (`"files": []`, only `"references"`). Running `tsc --noEmit -p .` against it is a silent no-op — it reports zero errors without checking anything. The real check is `tsc -b` (what `npm run build` runs). This was discovered mid-migration when a `tsc -b` run surfaced real errors that repeated `tsc --noEmit -p .` runs had missed. All verification from that point on used `npm run build`.
- `@base-ui/react` was already a project dependency (and already used by `combobox.tsx`) alongside `radix-ui`; both coexisted fine during the migration.

## Dependency order

Leaves (no ui-to-ui deps): badge, button, dropdown-menu, label, scroll-area, select, separator, slider, tabs, toggle, tooltip — migrated first via one `shadcn add --overwrite` batch, typechecked clean.
Then `toggle-group` (imports `toggleVariants` from `toggle`).
Then `dialog`, `alert-dialog` (both import `Button`).

## Style flip

`components.json` `style: "radix-mira"` -> `"base-mira"` (whole-project mode, not progressive) once dependency order was mapped.

## `cn` import convention preserved

Every `shadcn add --overwrite` delivered files importing `cn` from the new `"cn"` npm package (the current registry default). The rest of the project (22 non-ui files) uses the project's own hand-rolled `cn` at `@/app/lib/utils` (clsx + tailwind-merge) — this is the project's real, pre-existing customization, not something to let the CLI silently overwrite. Reverted the import in all 14 migrated files back to `@/app/lib/utils`, then removed the now-unused `cn` package from `package.json` and ran `npm install` to sync the lockfile.

## App-code consumer sweep (against `consumer-props.md`)

The wrapper-level migration alone left the build broken; a full `asChild` grep scoped to `src/app` (not `src/`) initially missed two areas:

- `src/marketing/**` (5 files: `App.tsx`, `LandingPage.tsx`, `LandingFooter.tsx`, `MarketingHeader.tsx`, `ChangelogSection.tsx`) — all `<Button asChild><Link .../></Button>` -> `<Button render={<Link .../>} />`.
- `src/app/components/ui/combobox.tsx` — `<InputGroupButton asChild><ComboboxTrigger /></InputGroupButton>` -> `render={<ComboboxTrigger />}` (InputGroupButton forwards to the now-Base-UI `Button`, which lost `asChild` along with everything else).
- `src/app/components/ActionBar.tsx`, `TopBar.tsx`, `SchemaFormField.tsx`, `component-example.tsx` (unused scaffold file, fixed anyway for correctness) — `TooltipTrigger`/`DropdownMenuTrigger`/`AlertDialogTrigger` `asChild` -> `render`.
- `src/app/components/InitModal.tsx` — `DialogContent onInteractOutside={(e) => e.preventDefault()}` has no Popup-level equivalent; moved to `Dialog onOpenChange`, canceling on `eventDetails.reason === 'outside-press' | 'focus-out'` (see `overlays.md`).
- `src/app/components/MaterialPreviewOverlay.tsx` — the shadcn `slider.tsx` wrapper is a non-generic function (`function Slider({...}: SliderPrimitive.Root.Props)`), so it loses Radix's implicit "value is always an array" contract; its `onValueChange` value type is `number | readonly number[]` regardless of what the caller passes. Fixed the one call site: `value[0] ?? 0` -> `(Array.isArray(value) ? value[0] : value) ?? 0`.
- `src/app/components/SchemaFormField.tsx` — one `Select onValueChange` callback indexed `arg.yields[value]` (a `Record<string, ArgDef[]>`); in this call site Base UI's inferred value type includes `null`. Guarded: `arg.yields[value ?? '']`. Every other `Select` usage in the app (`MaterialPreviewOverlay`, `InitModal`, `GridlinesDialog`, `CommandForm`) passes the value straight to a `useState` setter or a cast, which stays type-safe without changes — checked individually, not assumed.
- `src/app/components/ui/scroll-area.tsx` — the CLI-delivered file had an unused `import * as React from "react"` (React 19 automatic JSX runtime) and a redundant `"use client"` directive (Vite/no RSC); removed both.

Excess-property-check gap (worth flagging for future maintainers): `tsc -b` did **not** catch every stale `asChild` — some generic Base UI wrapper prop types swallow unknown JSX props silently instead of erroring, so `grep -rn "asChild"` across the full `src/` tree was the actual source of truth, not the compiler. Always grep before trusting a clean `tsc -b` on this kind of migration.

## Regression found after initial sign-off: `onSelect` on menu items

User report after the migration was signed off: "gridlines dialog doesn't seem to appear when clicking the menu btn." Root cause: every `DropdownMenuItem onSelect={...}` in `src/app/components/TopBar.tsx` (9 usages: Export .py, Connect/Disconnect local agent, Undo, Redo, Gridlines…, Zoom In/Out/Fit) was silently dead. Radix's `DropdownMenuItem` has a semantic `onSelect: (event: Event) => void` prop fired on choosing the item. Base UI's `Menu.Item` has no such prop — its click handler is `onClick`. But `MenuItem.Props` extends the generic `BaseUIComponentProps<'div', ...>`, which is built on React's own DOM attribute types, and those already declare a *native* `onSelect` (the browser's text-selection event, valid on any element). So `onSelect={...}` type-checked without complaint and silently attached to the wrong, effectively-never-fires event instead of erroring or being ignored. This is a same-name/different-semantics collision, not a missing-prop error, so it passed both `tsc -b` and every grep sweep for Radix leftovers. `consumer-props.md`'s "Universal" table only calls out `asChild` -> `render`; it does not call out `onSelect` -> `onClick` for menu items — worth adding to that reference for the next migration. Fixed: all 9 renamed `onSelect` -> `onClick` in `TopBar.tsx`. `DropdownMenuCheckboxItem`'s `onCheckedChange` is a distinct, non-colliding prop name and was unaffected. Full repo grep (`grep -rn "onSelect=" src/`) confirms zero remaining occurrences.

## Left alone

- `cmdk` (command), `sonner`, `input-otp`, `react-day-picker` (calendar), `recharts` (chart) — not radix, untouched, per hard rule.
- `src/app/components/ui/badge.tsx`, `button.tsx`, `chart.tsx`, `combobox.tsx`, `tabs.tsx`, `toggle.tsx` — each has one pre-existing `react-refresh/only-export-components` ESLint error (verified identical against the original committed radix files via `git show HEAD:<file> | eslint --stdin`); not introduced by this migration.
- `src/app/generated/commandSchemas.generated.ts` — pre-existing "unused eslint-disable directive" warning, unrelated.

## Behavior changes (flagged, not patched)

- **Tabs**: Radix defaulted to manual activation only via explicit `activationMode="manual"` (not used here); Base UI's `Tabs` defaults to manual activation regardless. Not used in a way that's user-visible in this app today (no keyboard-heavy tab flows), but flagged per the skill's hard rule.
- **Menu items**: Base UI's `CheckboxItem`/`RadioItem` default `closeOnClick` to `false` (Radix closed on select). None of the current `DropdownMenuCheckboxItem` usages in `TopBar.tsx` rely on close-on-click, so no functional regression observed, but flagged since it's a real default-behavior delta.
- **Dialog outside-press**: `InitModal`'s "don't dismiss on outside click" now goes through `onOpenChange` + `eventDetails.cancel()` instead of `event.preventDefault()`. Functionally equivalent; verify by hand (see below).

## Verify by hand

1. Studio (`/studio`, needs Clerk sign-in — not verified in this session, see note below): open the "New Model" dialog, click outside it — it must stay open (regression check for the `onInteractOutside` -> `onOpenChange` rewrite).
2. Top bar File/Edit/View dropdown menus open and their items are clickable (Trigger `render` rewrite).
3. Action bar zoom/fit/perspective tooltip buttons: hover shows the tooltip, click still fires the action (Tooltip `render` rewrite doesn't eat the click).
4. Material preview panel: drag the scrub slider end-to-end, confirm the scrub count updates smoothly at both ends (Slider array/number fix).
5. Command form "Element Type"-style choice `Select` fields: switching options still reveals/hides the right nested args (`arg.yields` null-guard).
6. Landing page (`/`, no auth needed) and 404 page (`/nonexistent`): "Sign up" / "Open Studio" buttons render as real links and navigate (Button `render` rewrite in marketing pages + `App.tsx`).
7. Combobox-based search/autocomplete field (used in `CommandForm`): the trigger chevron button still opens the list.

## Not verified in-browser

This session has no headless browser tooling (no Playwright/chromium-cli) and `/studio` is gated behind Clerk sign-in with no test bypass configured. Verification here is: full `tsc -b && vite build` success, `eslint` parity with the pre-migration baseline, a repo-wide grep sweep (zero `radix-ui`/`@radix-ui`/`asChild` remaining), and confirming via `curl` that the dev server serves the landing page and transforms every changed module without a Vite/esbuild error. The hand-check list above still needs a human pass, especially item 1 (Clerk-gated).

Derived remaining-Radix count: **0 wrappers remain on Radix** (`grep -rln "radix-ui" src/app/components/ui/` is empty).
