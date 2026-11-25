# PDF underlays (drawing sheets as plan backgrounds)

Import a page of a PDF drawing set, place it under a story plan at the right scale and position, and draw the model over it.

## Concept

An **underlay** is a layout object, like a grid line or a level: UI-only, never in the Model, never exported to OpenSees, never
invalidates results. It is one PDF page drawn as a textured plane at a level's elevation, with a 2D similarity transform
(translate, rotate, uniform scale) from PDF page coordinates (points, 1/72 in of paper) to world X–Y.

```
PDF bytes (IndexedDB, keyed by SHA-256) ─► pdf.js worker ─► ImageBitmap ─► Underlay plane (r3f) at level z
UnderlayEntity (store, layout directive) ──────────────────► transform, opacity, visibility, level
```

## Data

`types/underlays.ts`

```ts
export interface UnderlayEntity {
  id: number
  name: string            // file name + page, editable
  file: string            // SHA-256 of the PDF bytes (key in the underlay file store)
  page: number            // 1-based
  level: number | null    // LevelEntity id; null = base (z = 0). An id, not an index, so inserting a level doesn't move it.
  origin: [number, number] // world X, Y of PDF point (0, 0) (page bottom-left)
  scale: number           // world length units per PDF point
  rotation: number        // radians, about the origin
  opacity: number         // 0..1
  knockout: boolean       // white → transparent (see Rendering)
  visible: boolean
  locked: boolean         // locked underlays can't be moved/calibrated by accident
  crop?: [number, number, number, number] // PDF-point rect, hides title block/borders
}
```

- Store: `underlays`, `nextUnderlayId`, setters alongside `gridlines` / `levels` in `useAppStore`. Same undo semantics as grids (not in the model
  snapshot stack).
- Transform helpers in `lib/underlays.ts` (pure, tested): `pdfToWorld`, `worldToPdf`, `fromTwoPoints(pdfA, pdfB, worldA, worldB)` (similarity),
  `scaleFromRatio(...)`, `parseDrawingScale('1/8" = 1\'-0"' | '1:100')`.

## Persistence

- **PDF bytes**: a small IndexedDB store (`lib/underlays/fileStore.ts`, own DB, not the results DB), keyed by hash. Re-importing the same file
  reuses it. Deleting the last underlay that uses a file drops it.
- **Saved project (.py)**: underlay metadata goes in the `layout` directive (`underlays: [...]`) with the file name and hash, not the bytes. On open,
  an underlay whose hash isn't in IndexedDB shows as a placeholder rectangle with a "Relink PDF…" action (hash checked, warns on mismatch but lets the
  user accept it, e.g. a revised sheet).
- Decided: PDFs are never embedded in the saved project. A `.zip` project bundle stays a possible later option.

## Rendering

- `pdfjs-dist` with its own worker (lazy-loaded on first import, so the app bundle doesn't grow). Render the page (cropped) to an `ImageBitmap` at a
  resolution capped by `gl.capabilities.maxTextureSize` (target ~4096 px on the long side; a D-size sheet at that is ~110 dpi).
- `components/r3f/Underlays.tsx`: one plane mesh per visible underlay at the level elevation, `depthWrite: false`, `renderOrder` below everything,
  `raycast` disabled (never picked, never blocks clicks). A tiny shader material: opacity, optional grayscale/fade, and **knockout** (alpha from
  luminance, so white paper vanishes and only linework shows over the grid and model).
- Shown in the plan view of its level by default; `viewSettings.underlaysIn3D` also shows them in 3D at their elevation (handy to check
  alignment between floors). Elevations (underlay on a grid's vertical plane) are a later extension; for a 2D model the single underlay sits in X–Y.
- Sharpness: phase 2 re-renders the visible region at higher resolution after zoom settles (one extra texture for the viewport crop), keeping the
  whole-page texture as the base.
- Call `invalidate()` when a texture finishes loading.

## Scale and placement

Three ways, all ending in the same `origin/scale/rotation`:

1. **Drawing scale** (on import): pick or type the scale printed on the sheet (`1/8" = 1'-0"`, `1:100`, ...). With the model's length unit known,
   `scale = (paper in per PDF pt) × (real length per paper length)` converted to the model unit. Unitless models skip this.
2. **Calibrate** (two clicks on the underlay + a typed real distance, parsed with `units.parse`, e.g. `24 ft`): corrects scale only, keeps the first point fixed.
   This is the reliable route because PDFs are often printed "fit to page".
3. **Align** (two point pairs: a point on the sheet, then the world point it should land on, snapped to grid intersections / nodes): solves
   translation + rotation + scale at once. Typical use: click grid A/1 and grid D/5 on the sheet, then the same intersections in the model.
   A "keep scale" toggle makes it translation + rotation only.

Plus a numeric section in the panel (origin, rotation in degrees, scale) and a **Move** drag for quick nudges. Both tools are `ToolId`s
(`underlayCalibrate`, `underlayAlign`) handled in `ToolLayer`, picking on the underlay's plane with a ray–plane intersection, with snapping
to the vector points below when available. Status prompts in the `ActionBar` ("Pick first point on drawing…").

## Snapping to drawing linework (phase 3, deferred)

Vector PDFs (most CAD exports) carry the lines. pdf.js `getOperatorList` gives path segments; extract endpoints and line intersections (capped,
spatially hashed) into `SnapPoint`s of a new kind `underlay` (lowest priority after node/grid/mid). This is what makes "drawing over" the
sheet precise rather than eyeballed. Scanned PDFs just have no snap points.

## UI

- Ribbon, Model tab → **Layout** group (next to Grids / Levels): `Import PDF…` and `Underlays` (opens the panel).
- **Import dialog**: file picker → page thumbnails (pdf.js, small renders) → pick page(s) → for each, level (defaults to the current plan level)
  and drawing scale → placed with the page's bottom-left at the origin, then the user is offered Align.
- **Underlays panel** (a shadcn `Dialog` or a left-panel section, like the grids dialog): list with visibility eye, level `Select`, opacity
  `Slider`, knockout `Switch`, lock, and actions Calibrate / Align / Crop / Relink / Delete. Selecting a row in plan view jumps to that level.
- View tab: global "Show underlays" toggle and opacity override, so the user can fade all sheets at once while reviewing.

## Status

Phase 1 is in: store + types + transform math, file store, pdf.js render, `Underlays.tsx`, `UnderlaysDialog` (import with page thumbnails,
level and printed scale; per-sheet visibility, level, scale, origin, rotation, opacity, knockout, relink), layout-directive save/load, and
View > Reference toggles (`Sheets`, `Sheets 3D`). Differences from the plan above: the numeric transform fields came early; there is no
`locked` flag or grayscale yet; stored PDFs are not dropped when the last underlay using them is deleted (another saved project may still
reference them). Unitless models enter scale as model units per paper inch.

Phase 2 is in: the `underlay` tool (`UnderlayPickPanel`, picks in `ToolLayer`, store `underlayPick`) started from each sheet's row in the
dialog. Calibrate (two points + typed distance, first point stays put), Align (sheet point → model point, snapped to grids and nodes; Enter
after one pair just moves; a second pair rotates and scales unless "keep scale"), and Crop (two corners; `crop` in page points, "show whole
page" resets it). Starting a pick switches to the sheet's plan and makes it visible.

## Phases

1. Store + types + transform math (tests), file store, pdf.js render, `Underlays.tsx`, import dialog with drawing scale, panel with
   level/opacity/visibility/knockout, layout directive save/load with relink placeholder.
2. Calibrate and Align tools, numeric transform, crop.
3. Vector snap points; high-res re-render on zoom.
4. Elevation underlays on grids; project bundle export.

## Tests

`underlays.test.ts`: `fromTwoPoints` round-trips, drawing-scale parsing in imperial/metric against model units, `pdfToWorld`/`worldToPdf`
inverse. `project.test.ts`: underlay metadata survives save/open and a missing file yields a placeholder, not an error. Vector extraction tested
on a small checked-in PDF fixture.
