# slider

2026-09-18, golden pair via CLI (`shadcn add slider --overwrite`). Restructured (`Range` -> `Indicator`, new `Control` wrapper, `thumbAlignment` added). One real consumer-side break found and fixed.

## Changed

- `src/app/components/ui/slider.tsx` — CLI-delivered `base-mira` variant (`Root > Control > Track > Indicator` + `Thumb`s, `thumbAlignment="edge"`). Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- `src/app/components/MaterialPreviewOverlay.tsx:306` — the wrapper is a **non-generic** function (`function Slider({...}: SliderPrimitive.Root.Props)`), so unlike Radix (where slider values are always arrays), Base UI's `onValueChange` value type resolves to `number | readonly number[]` regardless of what the caller passes in as `value`. The scrub slider's handler did `value[0] ?? 0`, which `tsc -b` correctly flagged (`TS7053`, index into a type that might be a plain `number`). Fixed: `(Array.isArray(value) ? value[0] : value) ?? 0`.

## Left alone

Only one `<Slider>` usage exists in the app; no other call sites needed the same fix.

## Behavior changes

- `inverted` prop was removed in Base UI (per `consumer-props.md`); not used anywhere in this app, no-op.
- `onValueCommit` -> `onValueCommitted` rename; not used anywhere in this app, no-op.

## Verify by hand

1. In the Material Preview panel, drag the scrub slider from 0 to the max point count and back — the displayed count (`{scrubCount ?? previewPointCount}/{previewPointCount}`) must track smoothly at both extremes, including exactly at 0 and at max (the array/number boundary case this fix targets).
