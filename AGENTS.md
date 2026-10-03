PySees is a web-based GUI for building, running, and postprocessing structural models. Analysis runs
**in the browser** on Carapace, a Rust finite-element engine compiled to WebAssembly (sibling repo
`../carapace`, bundled here as `src/app/carapace/wasm`). OpenSees is optional: the user exports the
model as an OpenSeesPy script (`.py`; `.tcl` planned) and runs it themselves. The app never talks to a
local OpenSees process or agent.

---

## IMPORTANT NOTES

- Do not build or run the dev server unless specifically asked.
- Use standard shadcn components (Base UI flavor, not Radix) and architecture wherever possible.
- Keep code compact. Do not newline every property of a JSX element or object literal.
- When a task has an unclear outcome, ask for more information.
- 2D/3D, not "planar"/"spatial", in prose and docs.
- No local-agent / websocket / OpenSees-process connectivity anywhere in the UI. In-browser analysis goes through Carapace.

---

## Tech Stack

Vite, React, TypeScript, Zustand (`src/app/store/useAppStore.ts`), Three.js via @react-three/fiber +
drei, shadcn/Base UI + Tailwind v4, recharts (charts), TanStack Table, react-router, Clerk (auth gate on `/studio`).
Carapace wasm runs in Web Workers; results persist in IndexedDB through a storage worker.

Routes: marketing pages (`src/marketing`) and the app at `/studio` (`AppShell`), behind sign-in.

---

## Core Concept

The user builds a parametric model; everything downstream is derived from it.

```
Model (entity maps)  ─┬─► 3D viewport (r3f)
AnalysisHistory      ─┼─► compileInputV1 ─► Carapace wasm worker ─► results (IndexedDB) ─► results viewport / plots
                      └─► exportScript ─► OpenSeesPy .py
```

- **Model** (`types/model.ts`): maps of typed entities (nodes, materials, sections, geomTransfs,
  beamIntegrations, elements, fixes, mpConstraints, timeSeries, patterns, regions, misc) plus
  `nextIds`. Edited through `applyModelWrite` / `deleteEntity` (`lib/modelWrite.ts`); undo/redo is a
  snapshot stack (`modelPast`/`modelFuture`). IDs are app-managed.
- **AnalysisHistory** (`types/analysisCommands.ts`, `analysisSequence.ts`): authored analysis commands,
  with cursor undo/redo. `analysisBlocks.ts` defines blocks that lower to stages/recorders;
  `compileAnalysisSequence.ts` turns them into a sequence of stages (static now; modal/transient not yet
  compiled).
- `ndm` (2|3) and `ndf` are fixed at init (`InitModal`); changing them means a new model.
- Editing the model or analysis history invalidates stored results (store subscription clears them).

---

## Carapace pipeline

- `lib/carapace/compileInputV1.ts` compiles Model + sequence into `CarapaceInputV1`
  (`types/carapaceInputV1.ts`, mirrors Rust `input_v1` in `../carapace/wasm-bridge`), returning
  diagnostics for anything unsupported. Material/section arg names are the **schema** names (lowercase,
  e.g. `fy`, `e0`, `epsU`), not OpenSees doc capitalisation.
- `workers/carapaceWorker.ts` decodes the input, advances in chunks (cooperative cancel), and streams
  recorder batches to `workers/resultsStorageWorker.ts` over a `MessageChannel`. Client side:
  `lib/carapace/carapaceWorkerClient.ts`. Store state: `carapaceRun`.
- Rebuild the bundled wasm after Carapace changes: `scripts/build-carapace.sh` (needs the `../carapace` checkout,
  `wasm-bindgen`).
- Material Preview (`MaterialPreviewOverlay`, `lib/carapace/materialPreview.ts`) drives Carapace's
  `createMaterialProbe` (unit zero-length spring, prescribed strain) through a load protocol
  (`lib/materialPreviewProtocol.ts`) and charts strain vs stress. Points are committed in one store update.
  See `docs/carapace-material-preview-handoff.md`.

---

## Schema System

Forms and OpenSeesPy codegen derive from declarative `ArgDef` schemas (`types/schema.ts`,
`lib/commandSchemas.ts`); there is no per-command UI code. `SchemaFormField` renders the tree
(int/float/str, vec, flag, choice, idlist); fields with no schema default start blank.

- `src/app/generated/commandSchemas.generated.ts` is generated from the OpenSeesPyDoc RST:
  `npm run schema:extract` then `npm run schema:build` (see README). Curated uniaxial defaults and
  optional-arg overrides live in `scripts/uniaxial-material-defaults.json`. Prefer fixing the generator
  inputs over hand-editing generated output (if you must patch it, mirror the change in the generator).
- `lib/templates.ts` provides starter models; their material `args` must use schema names.

---

## UI Layout

| Alias      | Component(s)                                   | Description |
|------------|------------------------------------------------|-------------|
| top menu   | `TopBar`                                       | File (new, export .py), edit (undo/redo), view settings |
| left panel | `ModelPanel` / `AnalysisPanel` (`AppShell`)    | Model entities and analysis blocks; toggled by `activePanel` |
| right      | `CommandForm`, `MaterialDialog`, `sections/*`  | Schema forms, material picker/preview, fiber section editor |
| bot menu   | `ActionBar`                                    | Status, zoom, cursor coords |
| viewport   | `Viewport` + `components/r3f/*`                | 3D model and results scene (nodes, elements, supports, loads, gridlines, levels, deformed shape, force diagrams) |
| results    | `ResultsPanel`, `ResultsDisplayPanel`, `plot/*` | Run controls, display options, step playback, plot overlay and data tables |
| overlays   | `MaterialPreviewOverlay`, `PlotOverlay`        | Floating panels over the viewport |

Results live in IndexedDB (`lib/resultsStorage`), read per step for display (`useResultsSource`,
`stepFrames`); 2D models render in the XY plane.

---

## Exporting to OpenSees

`lib/exportScript.ts` renders the model and analysis history to an OpenSeesPy script
(`File > Export .py`); renderers go through the same schemas as the forms. Tcl export and a tidier
download flow are planned. Importing recorder output from an external OpenSees run is a possible
future path, but the primary results path is Carapace.

---

## Key Constraints

- Analysis is in-browser via Carapace; no OpenSees runtime, local agent, or server compute.
- ndm/ndf immutable after init.
- App-managed IDs for all entities.
- Anything the Carapace compiler can't yet express must surface as a compile diagnostic, not silently degrade.
- Exported scripts must remain valid OpenSeesPy.
- Results never enter the model or analysis history; they are derived and discarded when either changes.
- Scripting (`SCRIPTINGPLAN.md`) is deferred.
