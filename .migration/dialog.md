# dialog

2026-09-18, golden pair via CLI (`shadcn add dialog --overwrite`, migrated after `button` since `DialogContent`'s close button renders a `Button`). Restructured (`Overlay` -> `Backdrop`, `Content` -> `Popup`, centered modal so no `Positioner`).

## Changed

- `src/app/components/ui/dialog.tsx` — CLI-delivered `base-mira` variant. Re-pointed `cn` import to `@/app/lib/utils`. Leftover scan clean.
- `src/app/components/InitModal.tsx` — `<DialogContent onInteractOutside={(e) => e.preventDefault()}>` has no Popup-level prop equivalent in Base UI (per `overlays.md`, dismiss callbacks consolidate into `Root.onOpenChange`'s `eventDetails`). Rewrote as:
  ```tsx
  <Dialog open onOpenChange={(_open, eventDetails) => {
    if (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out') eventDetails.cancel()
  }}>
    <DialogContent className="sm:max-w-lg">
  ```
  This preserves the original intent (the model-setup dialog can't be dismissed by clicking outside or by focus leaving it, since it's the app's mandatory first step) using the Root-level cancellation mechanism instead of a Popup-level event handler.
- `src/app/components/GridlinesDialog.tsx` uses `Dialog open={open} onOpenChange={setOpen}` (already a simple boolean setter) — no change needed; Base UI's `onOpenChange(open, eventDetails)` signature is backward-compatible with a single-argument `(open: boolean) => void` setter.

## Left alone

No other `Dialog` consumer in the app used `onOpenAutoFocus`/`onCloseAutoFocus`/`onEscapeKeyDown`/`onPointerDownOutside` — only `InitModal`'s `onInteractOutside` needed the rewrite.

## Behavior changes

- **Flag**: Radix's `onInteractOutside` covered both an outside pointer-press AND a focus-out event; the Base UI rewrite explicitly checks both `'outside-press'` and `'focus-out'` reasons to match, but the exact focus-trap mechanics differ slightly between the two libraries (Base UI's `modal` prop defaults to `true`, same as Radix, so focus should still be trapped inside the dialog regardless).

## Verify by hand

1. Open the app fresh (no model yet) — the "New Model" dialog appears and clicking outside it (on the dark backdrop) does **not** close it or move focus out (regression check for the `onInteractOutside` -> `onOpenChange` rewrite).
2. Create a model via any template — the dialog closes and doesn't reappear.
3. Open the Gridlines dialog (View menu -> "Gridlines…") — it opens/closes normally via its own controlled `open` state, and the close (X) button works.
