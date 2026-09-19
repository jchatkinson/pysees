# dropdown-menu

2026-09-18, golden pair via CLI (`shadcn add dropdown-menu --overwrite`). Radix `DropdownMenu` renamed + restructured to Base UI's `Menu` under the hood (public wrapper names kept as `DropdownMenu*`); canonical menu part mapping (`Label` -> `GroupLabel`, `ItemIndicator` -> `Checkbox/RadioItemIndicator`, `Sub`/`SubTrigger` -> `SubmenuRoot`/`SubmenuTrigger`).

## Changed

- `src/app/components/ui/dropdown-menu.tsx` — CLI-delivered `base-mira` variant (imports `Menu as MenuPrimitive` from `@base-ui/react/menu`). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- Every consumer using `<DropdownMenuTrigger asChild>...</DropdownMenuTrigger>` had to move to `render`:
  - `src/app/components/TopBar.tsx` (File / Edit / View menu triggers, 3 usages)
  - `src/app/components/component-example.tsx` (unused scaffold file, 1 usage, fixed for correctness)
- `src/app/components/ui/combobox.tsx` doesn't use `DropdownMenu` itself but broke as a downstream consumer of the now-Base-UI `Button`/`InputGroupButton` (its trigger button used `asChild`); tracked in detail in `project.md`, fixed alongside this batch since it shares the same `render`-migration mechanics.
- **Regression found after initial sign-off** (user report: "gridlines dialog doesn't seem to appear when clicking the menu btn"): every `DropdownMenuItem onSelect={...}` in `src/app/components/TopBar.tsx` (9 usages — Export .py, Connect/Disconnect local agent, Undo, Redo, Gridlines…, Zoom In/Out/Fit) was silently dead. Radix's `DropdownMenuItem` has an `onSelect: (event: Event) => void` prop; Base UI's `Menu.Item` has no such prop — its click handler is plain `onClick`. Because `MenuItem.Props` extends generic `BaseUIComponentProps<'div', ...>`, and React's own DOM typings already declare a native `onSelect` (a text-selection DOM event, valid on any element) as part of that base props type, `onSelect={...}` type-checked cleanly and silently attached to the wrong native event — one that never fires on a normal click. This was missed during the initial migration sweep because it isn't a compile error or a missing-prop error; it's a same-name, different-semantics collision. Fixed: all 9 renamed `onSelect` -> `onClick`. `DropdownMenuCheckboxItem`'s `onCheckedChange` is a distinct, non-colliding prop name and was not affected.

## Left alone

- `DropdownMenuCheckboxItem`/`DropdownMenuItem` usages in `TopBar.tsx` (View menu's Node IDs / Grid / Gridlines toggles, undo/redo actions) don't rely on the item staying open after click, so the default-behavior delta below doesn't currently affect this app.

## Behavior changes

- **Flag**: Base UI's `CheckboxItem`/`RadioItem` default `closeOnClick` to `false` (Radix closed the menu on any item select). `TopBar.tsx`'s View menu uses `DropdownMenuCheckboxItem` for view-setting toggles — verify by hand whether the menu now stays open after toggling a checkbox (arguably more convenient for toggling multiple view settings in one interaction, but it's a real behavior change worth confirming intentional).

## Verify by hand

1. Open each of File / Edit / View in the top bar — menu opens under the correct trigger button, all items are keyboard-navigable (arrow keys + typeahead).
2. Click a checkbox item in the View menu (e.g. "Node IDs") — the setting toggles; note and confirm whether the menu now stays open (see behavior-change flag above).
3. Undo/Redo items in the Edit menu still fire their actions and respect the `disabled` state.
