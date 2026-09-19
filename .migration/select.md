# select

2026-09-18, golden pair via CLI (`shadcn add select --overwrite`). Restructured (`Viewport` -> `List`, `ScrollUp/DownButton` -> `ScrollUp/DownArrow`, `position` -> `alignItemWithTrigger`). One real consumer-side null-safety break found and fixed; every other usage verified safe individually rather than assumed.

## Changed

- `src/app/components/ui/select.tsx` — CLI-delivered `base-mira` variant (`const Select = SelectPrimitive.Root` direct re-export, preserving Base UI's generic `Value` inference for consumers). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- `src/app/components/SchemaFormField.tsx:401` — `onValueChange={(value) => { setValue(key, value); for (const child of arg.yields[value] ?? []) ... }}`. Because `Select` is a direct generic re-export, `tsc -b` correctly inferred this call site's `onValueChange` value type as `string | null` (Base UI's Select can report `null`; empirically, an isolated single-file probe with a hardcoded string `value` prop did NOT show `null` in the inferred type, but the real, more complex call site did — don't trust an isolated probe over the actual `tsc -b` output). Fixed: `arg.yields[value ?? '']`.

## Left alone

Every other `Select` usage in the app was individually checked rather than assumed safe:
- `src/app/components/MaterialPreviewOverlay.tsx` (2 usages) — value flows straight into a `useState` setter typed to accept the union; no index/narrowing operation, no fix needed.
- `src/app/components/InitModal.tsx` (4 usages) — same pattern, value is cast (`as CantileverParams['eleType']` etc.) or passed to a local setter; no fix needed.
- `src/app/components/GridlinesDialog.tsx` (2 usages) — same pattern.
- `src/app/components/CommandForm.tsx` — uses a `Combobox`, not `Select`; not in scope for this file.

## Behavior changes

- **Flag**: `onValueChange` gains an `eventDetails` second argument and can report `value: null` (see fix above) in some call shapes — none of this app's handlers currently read the second argument, so no further action, but future `Select` additions should check this per-call-site rather than assume `string`.
- `position="popper" | "item-aligned"` -> `alignItemWithTrigger` boolean; not used anywhere in this app (no `position` prop passed at any call site).

## Verify by hand

1. Command form's "Element Type"-style choice field: switching the selected option correctly reveals/hides its nested args (exercises the exact `arg.yields[...]` line that was fixed).
2. `InitModal`'s ndm/element-type/base-condition selects, `MaterialPreviewOverlay`'s protocol-type select, and `GridlinesDialog`'s axis/label-style selects all open, list their options, and update on selection.
