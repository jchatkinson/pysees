# separator

2026-09-18, golden pair via CLI (`shadcn add separator --overwrite`). Direct 1:1 mapping (callable primitive, `decorative` prop dropped).

## Changed

- `src/app/components/ui/separator.tsx` — CLI-delivered `base-mira` variant. Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.

## Left alone

No consumer (`ActionBar.tsx`, `TopBar.tsx`, `GridlinesDialog.tsx`) passed a `decorative` prop, so the dropped prop required no call-site changes.

## Behavior changes

None.

## Verify by hand

1. Vertical separators in the top bar and action bar still render as thin dividers at the right height.
