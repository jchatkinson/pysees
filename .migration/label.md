# label

2026-09-18, golden pair via CLI (`shadcn add label --overwrite`). Per the skill's hard rules, Radix `Label` has no Base UI primitive counterpart — the base variant renders a native `<label>`.

## Changed

- `src/app/components/ui/label.tsx` — CLI-delivered `base-mira` variant (native `<label>` + `cn`-merged classes, no primitive import at all). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.

## Left alone

Nothing else touches Label's internals; it was never used with `asChild` anywhere in the app (native labels don't support it).

## Behavior changes

None functionally — a native `<label htmlFor>` behaves identically to Radix's `Label` (which itself wrapped a native label).

## Verify by hand

1. Form field labels in `SchemaFormField.tsx` and `GridlinesDialog.tsx` still associate with their inputs (click a label, focus moves to its control).
