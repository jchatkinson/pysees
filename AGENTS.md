PySees is a web-based GUI for building, running, and postprocessing structural models. Analysis runs
**in the browser** on Carapace, a Rust finite-element engine compiled to WebAssembly (sibling repo
`../carapace`, bundled here as `src/app/carapace/wasm`). OpenSees is optional: the user exports the
model as an OpenSeesPy script (`.py`; `.tcl` planned) and runs it themselves. The app never talks to a
local OpenSees process or agent.

---

## IMPORTANT NOTES

- Do not build pysees or run the pysees dev server unless specifically asked.
- Use standard shadcn components (Base UI flavor, not Radix) and architecture wherever possible.
- Keep code compact. Do not newline every property of a JSX element or object literal.
- When a task has an unclear outcome, ask for more information.
- 2D/3D, not "planar"/"spatial", in prose and docs.
- No local-agent / websocket / OpenSees-process connectivity anywhere in the UI. In-browser analysis goes through Carapace.

---

## Tech Stack

Vite, React, TypeScript, Zustand (`src/app/store/useAppStore.ts`), Three.js via @react-three/fiber +
drei, shadcn/Base UI + Tailwind v4, recharts (charts), TanStack Table, react-router.
Carapace wasm runs in Web Workers; results persist in IndexedDB through a storage worker.

Routes: marketing pages (`src/marketing`) and the app at `/studio` (`AppShell`), accessible without an account.

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

- Carapace runs 2D (ndm=2/ndf=3) and 3D (ndm=3/ndf=6) models: `ElasticBeamColumn`, `DispBeamColumn` (fiber, with `-GJ` torsion in 3D) and `Truss`, plus 3D `ShellMITC4` / `ShellDKGT` (4- and 3-node shells with `ElasticMembranePlateSection`; nodal, self-weight and pressure loads); 3D `Corotational`, `-jntOffset`, zero-length and `forceBeamColumn` are diagnostics. **3D models are Z-up** (plan is X–Y, levels rise in Z; 2D models are in the XY plane, Y up). A beam's local axes come from its transformation's `vecxz` (`lib/memberFrame.ts`, OpenSees rule: `y = vecxz × x`, `z = x × y`), and loads, the deformed shape and the 3D force diagrams (Vy/Vz, Mz/My, T) all use them.
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
  inputs over hand-editing generated output (if you must patch it, mirror the change in the generator). `npm run schema:check` fails if the
  committed file differs from what the generator produces.
- `scripts/schema-patches.json` holds corrections the docs can't express, applied at build time (`command` or `command/Type` → wholesale `args`,
  vec `length` (number, `ndm`, `ndf`, or `{ref, times}` = counted by an earlier arg), `kind`, `word`, and per-arg `ndm: 2|3`). Each carries a `_why`. The build also merges a
  command's several doc signatures into one ordered list and renames repeated arg names (`eleOnlyEles`) so a values bag can hold them all.
- `lib/templates.ts` provides starter models; their material `args` must use schema names.

---

### ndm-specific layouts

Some commands take different arguments in 2D and 3D (`section Elastic`: `E A Iz [G alphaY]` vs `E A Iz Iy G J [alphaY alphaZ]`; `elasticBeamColumn`: `A E Iz transf` vs
`A E G J Iy Iz transf`). An `ArgDef` may carry `ndm: 2 | 3`, and `getAvailableSchemas(ndm)` returns schemas resolved to that dimension (memoized), so forms,
decode and encode only ever see a plain list. Elements get their layout from `commands/tables.ts` (`elementArgs(spec, ndm)`); the element form is checked
against it in `ndmLayouts.test.ts`. Tag the arg, don't branch on `ndm` in UI or codec code.

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

## Script import / export (OpenSeesPy and Tcl)

One command layout, read by everything. Tcl and OpenSeesPy share a positional argument sequence, so the language-specific code is only syntax.

```
.tcl / .py text ─► scriptImport/{tcl,python}.ts ─► Tok[] ─► commands/decode.ts ─► ModelWrite ─► Model
Model ─► commands/encode.ts ─► Call[] ─► commands/print.ts ─► .py / .tcl text
```

- `commands/grammar.ts`: `decodeArgs` / `encodeArgs`, the inverse pair over a schema's `ArgDef` tree (generated schemas and the forms). A bare
  `-flag` is `values['-flag'] = true`; a flag with values is emitted only when those values exist, never dangling.
- `commands/tables.ts`: layouts the generated schemas can't express (elements, fiber-section children, eleLoad component order), used by both directions.
- `commands/decode.ts` / `encode.ts`: per-command mapping between positional tokens and entities. Add a command here once; import, export and Tcl follow.
- `commands/print.ts`: the only place that knows Python vs Tcl syntax (`ops.` prefix, `{}` bodies, `BasicBuilder`). Deterministic.
- `scriptImport/`: a **static** reader, never an interpreter. It substitutes constants (`set L 6`, `L = 6`) and arithmetic (`expr`, `math.*`);
  `for`/`if`/`proc`/`def` are reported and skipped. Model building only: analysis commands are ignored with an info diagnostic. Unsupported
  elements/commands are diagnostics, not silent drops. `File > Import` (`ImportScriptDialog`) replaces the model via `initModel`.
- Shell pressure has no OpenSees equivalent: `encode.ts` expands it into per-node `load` commands (`lib/shells.ts` holds the consistent integral, a copy of Carapace's) and `-selfWeight` is exported with the sign OpenSees uses (negated). Pressure fixtures are therefore excluded from `roundtrip.test.ts` and from the element-force comparison. A `ShellDKGT`'s self-weight is expanded the same way (OpenSees doubles it). Shell stress resultants are recorded as `shell:<tag>` columns (see `docs/shell-plan.md`, Results format) and drawn by the `contour` result type (`lib/shellContour.ts`).
- Exported scripts must be accepted by real OpenSees. `ElasticBeamColumn` is unknown to OpenSeesPy (it needs `elasticBeamColumn`) and `Truss`
  needs its area; `opensees.test.ts` runs every export in the repo's `.venv`. This OpenSeesPy build has no Tcl interpreter, so Tcl is covered by
  the cross-language round trip and golden files only.

Tests (`npm test`): `grammar.test.ts` round-trips every generated command variant and requires none to be ambiguous (fix the schema in `schema-patches.json`, don't
allowlist); `schemaPatches.test.ts` runs real calls for each patched command through the schema and real OpenSees; `roundtrip.test.ts` (export → import → equal model, in both languages);
`golden.test.ts` (checked-in exports in `commands/__golden__/`, update with `vitest -u` only for intended changes); `opensees.test.ts`;
`carapaceVsOpenSees.test.ts` runs the same model in Carapace (the bundled wasm, loaded in Node) and in real OpenSees from the exported script and requires the
recorded displacements, reactions and element forces to agree step by step (relative tolerance 1e-5; observed ~1e-6). Add a fixture to `trussFixtures` /
the templates list to cover a new element or material. Element force responses differ by element (`elementForceRecorders` in `analysisBlocks.ts`): OpenSees `force`
is global, so beams export `localForce` to match the local N/V/M PySees shows; trusses and zero-length elements report global forces and keep `force`.

---

## Key Constraints

- Analysis is in-browser via Carapace; no OpenSees runtime, local agent, or server compute.
- ndm/ndf immutable after init.
- App-managed IDs for all entities.
- Anything the Carapace compiler can't yet express must surface as a compile diagnostic, not silently degrade.
- Exported scripts must remain valid OpenSeesPy.
- Results never enter the model or analysis history; they are derived and discarded when either changes.
- Scripting (`docs/SCRIPTINGPLAN.md`) is deferred.
