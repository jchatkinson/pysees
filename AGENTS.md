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
  `compileAnalysisSequence.ts` turns them into a sequence of stages: static (gravity, pushover), modal (eigen),
  transient (earthquake ground motion, Rayleigh or modal-anchor damping) and reset.
- `ndm` (2|3) and `ndf` are fixed at init (`InitModal`); changing them means a new model.
- Editing the model or analysis history invalidates stored results (store subscription clears them).

---

## Carapace pipeline

- Carapace runs 2D (ndm=2/ndf=3) and 3D (ndm=3/ndf=6) models: `ElasticBeamColumn`, `DispBeamColumn` (fiber, with `-GJ` torsion in 3D) and `Truss`, plus 3D `ShellMITC4` / `ShellDKGT` (4- and 3-node shells with `ElasticMembranePlateSection`; nodal, self-weight and pressure loads); 3D `Corotational`, `-jntOffset`, zero-length and `forceBeamColumn` are diagnostics. Multi-point constraints (`equalDOF`, `equalDOF_Mixed`, `rigidLink beam|bar`, 3D `rigidDiaphragm`) compile to Carapace's constraint tables (`compileConstraints`), and the exported script switches to `constraints('Transformation')`; a 2D `rigidDiaphragm` is an error, as in OpenSees. **3D models are Z-up** (plan is X–Y, levels rise in Z; 2D models are in the XY plane, Y up). A beam's local axes come from its transformation's `vecxz` (`lib/memberFrame.ts`, OpenSees rule: `y = vecxz × x`, `z = x × y`), and loads, the deformed shape and the 3D force diagrams (Vy/Vz, Mz/My, T) all use them.
- `lib/carapace/compileInputV1.ts` compiles Model + sequence into `CarapaceInputV1`
  (`types/carapaceInputV1.ts`, mirrors Rust `input_v1` in `../carapace/wasm-bridge`), returning
  diagnostics for anything unsupported. Carapace-only stud walls (`studWall` elements, `Anchorage` material, `floorLoad` pattern children and wall-type `eleLoad`s; `lib/studWalls.ts`) compile to `studWalls` / `floorLoads` / `wallLoad` element loads, flexible diaphragms (`diaphragm` elements, `lib/diaphragms.ts`) to `diaphragms`, and joist floors (`joistFloor` elements, `lib/floors.ts`: a plan polygon of any shape, joists at an angle and spacing, no stiffness) with their `floorLoad` area loads to `floorLoads` rows, one per joist strip piece bearing on the stud walls its centre line crosses (`floorTransferRows`, shared with the OpenSees nodal export; a strip that also bears on a beam-column at the floor level is solved in PySees with the same statics and becomes wall top-line loads and nodal loads on the beam's nodes; edited in `FloorCard` with a takedown table, drawn with the Floor tool, framed in the extruded view by `floorFramingBoxes`); the stud-wall template is Carapace's `expandBuilding` turned into ordinary entities, and OpenSees export approximates each wall and diaphragm bay as elastic shells with a warning (`lib/studWallExport.ts`). Walls are edited in `StudWallCard` (`rebuildStudWall` rebuilds the station nodes) and drawn with the Stud wall tool (`drawStudWall`). A wall drawn with a hold-down **bears** on what is below it (`layout.bearing`: stud bearing and the pier-end hold-down inside the element, Carapace `docs/stud-wall-bearing.md`); `compileInputV1` adds its `base` stations from the nodes under it each compile (`wallBaseNodes`: other walls' top rows, beam-column nodes, supports; never stored; at a point where several meet, only walls in its own plane, since walls are designed as independent planes and coincident corners stay separate nodes), the export ties them with `equalDOF`s, and on the lowest level the wall gets supports at its ends. In 3D Carapace also ties a bearing wall's bottom corners to its base along the wall's normal (a wall is stiff only in its own plane; bearing doc D9), and `compileInputV1` warns about any wall node nothing holds along X or Y (`unheldWallNodes`), since Carapace leaves such a direction at zero without a word. Walls with an `anchorage` material keep explicit zero-length links. The BC Rowhouse template (`lib/rowhouseTemplate.ts`, `docs/rowhouse-template.md`) builds a real two-unit drawing set with `drawStudWall` (which also takes openings and extra studs) and adds its plan sheets as underlays (`public/templates/bc-rowhouse-plans.pdf`); it is the stud-wall test case, and the doc lists its known gaps. Wall members are entered as lumber (`lib/lumber.ts`: species/grade E from CSA O86 Table 6.4 / NDS Supplement Tables 4A–4B, sizes and plies) kept in the wall's `framing` arg; `applyFraming` sets the layout's EA / EI (typed overrides win), `guessFraming` reads sizes back from EAs for walls without it. Openings are entered as left edge (absolute or a fraction of the length) and width; a window's sill (`framing.openings[i].sill`) is drawing-only. Material/section arg names are the **schema** names (lowercase,
  e.g. `fy`, `e0`, `epsU`), not OpenSees doc capitalisation.
- Recorders compile to Carapace **bulk** recorders: one per node quantity (displacement, reaction, velocity, acceleration) and per element
  table (end forces, beam loads, shell resultants), each with the `rows` it records; each returns one flat `Float64Array` per step.
  `rowLayout` maps every value onto the stored row, which keeps OpenSees' recorder layout (one row per step, a column group per node or
  element, `recorderPlans`). Stud-wall pier and base recorders are still scalar; each wall's framing member forces are one `memberForce` bulk recorder (`studWallMemberLabels` / `readWallMembers`), shown in the axial view's Members mode (`resultsView.wallResults`: bars per member, heat-coloured framing in the extruded view, member table). `lib/resultsStorage/recorderRows.ts` builds the rows
  for the worker and the test runner alike.
- `workers/carapaceWorker.ts` decodes the input, advances in chunks (cooperative cancel), and streams
  step rows to `workers/resultsStorageWorker.ts` over a `MessageChannel`. Client side:
  `lib/carapace/carapaceWorkerClient.ts`. Store state: `carapaceRun`.
- Large-model timings: `PERF=1 npx vitest run src/app/lib/perf` (`towerTemplate`, a 20-story flat-slab tower; `TOWER=stories,baysX,baysY,mesh`, `DUMP=file.json` for the native CLI).
- Rebuild the bundled wasm after Carapace changes: `scripts/build-carapace.sh` (needs the `../carapace` checkout,
  `wasm-bindgen`; records the commit in `wasm/build-info.json`), then regenerate the verification page.
- Stage semantics follow OpenSees: a gravity block that holds loads freezes its patterns (`loadConst -time 0`); a pushover holds nothing, so consecutive pushovers on one pattern form a cyclic protocol (Carapace continues the load factor). `ModifiedNewton` reuses the tangent from the start of each step. A 2D fiber member honours `Corotational`; `PDelta` on fiber members, `-jntOffset` and `sp` are warnings.
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
| ribbon     | `ribbon/Ribbon`, `ribbon/commands.ts`, `ribbon/FileGroup` | The app's menu and toolbar: File button plus Model / View / Results tabs of grouped commands. Commands and hotkeys come from one table in `commands.ts` |
| left panel | `ModelPanel` / `AnalysisPanel` (`AppShell`)    | Model entities and analysis blocks; toggled by `activePanel` |
| right      | `CommandForm`, `MaterialDialog`, `sections/*`  | Schema forms, material picker/preview, fiber section editor |
| bot menu   | `ActionBar`                                    | Status, zoom, cursor coords |
| viewport   | `Viewport` + `components/r3f/*`                | 3D model and results scene (nodes, elements, supports, loads, gridlines, levels, deformed shape, force diagrams) |
| results    | `ResultsPanel`, `ResultsDisplayPanel`, `plot/*` | Run controls, display options, step playback, plot overlay and data tables |
| overlays   | `MaterialPreviewOverlay`, `PlotOverlay`        | Floating panels over the viewport |

Views (`viewMode` in the store, `lib/editor/viewSlice.ts` / `viewCamera.ts`): 3D (perspective or orthographic; perspective can fly, `flyMode`, `components/r3f/FlyControls.tsx`: WASD/QE, right-drag look, orbit target handed back on exit), a story plan or a grid elevation
(orthographic, pan/zoom only). A plan or elevation filters the model before the scene index is built, so hidden objects are neither drawn nor
pickable and results draw on the slice. A plan shows the story above as dashed ghosts (`GhostElements`).

Extruded view (`viewSettings.extruded`, `components/r3f/Extruded.tsx`, `lib/editor/memberShape.ts`): members swept at their section outline
(fiber sections, via `sectionOutline`) or a nominal one (an elastic member's equivalent rectangle from A, Iy, Iz; a square of area A for elastic sections and trusses), one `InstancedMesh` per
outline, oriented by the scene index's member frames, level members drawn hanging from their axis (top face on the node line; drawing only); shells as slabs of thickness `h`; stud walls as their framing (`lib/editor/wallFraming.ts`: studs, built-up posts, plates, jacks, headers, sills, rim, subfloor, see-through sheathing; sized from the wall's lumber framing). Displaced results stay as lines.

Drawing (`activeTool` in the store; `components/r3f/ToolLayer.tsx`, `components/DrawOptions.tsx`, `lib/editor/draw.ts`, `snap.ts`,
`properties.ts`): tools emit ordinary `ModelWrite`s through `DrawBatch` (merges coincident nodes, reuses a `geomTransf` with a matching
`vecxz`) and commit one undo step via `writeModelEntities`. Frame properties are derived from the elements (element type + args minus
`transfTag`), never stored. While a tool is active, scene clicks don't change the selection. Edit operations (`lib/editor/edit.ts`: move, copy/replicate, mirror, divide, merge, load writes) run from the Edit tab through `EditDialog` and commit one undo step via `editModel` / `writeModelEntities`; the shell tool meshes grid cells (`cellAt`, `meshQuad` in `snap.ts`). A selection of several objects shows `SelectionPanel` (reassign property, supports, delete) in place of the command form.

Viewport performance rules: the canvas renders on demand, so anything that changes what is drawn outside React props must call
`invalidate()` (store changes and `DisplayBuffers` already do). Draw many small things batched: one `useSegmentLines` /
`InstancedMesh` per layer recomputed on `useCameraChange()`, labels through `SceneLabels` (a cached glyph atlas, one instance per glyph or box, one draw call per layer, placed on the GPU and depth tested so the model hides them; `lift` pulls a label toward the camera by some pixels so one inside a member still shows); never an `<Html>` (except an interactive tooltip), drei `<Line>` or
`useFrame` per item, and never drei `<Text>` (its SDF generator loses the WebGL context).

PDF underlays (`types/underlays.ts`, `lib/underlays/`, `components/r3f/Underlays.tsx`, `UnderlaysDialog`): drawing sheets drawn under a level's plan (layout, like grids: not in the model or undo). pdf.js is lazy-loaded; PDF bytes live in their own IndexedDB store keyed by SHA-256 and are never embedded in saved projects (the `layout` directive references them; a missing file shows a placeholder and a relink action). Plan: `docs/pdf-underlay-plan.md`.

Displaced stud walls are drawn between their bottom and top chords (`sceneIndex.ts`: `WallChords`, `wallPoint`; a bearing wall's bottom runs through the nodes it stands on), and a joist floor's outline through the wall-top and beam nodes on its edges, so neither cuts straight between corners.

Results live in IndexedDB (`lib/resultsStorage`), read per step for display (`useResultsSource`,
`stepFrames`); 2D models render in the XY plane.

---

## Saved projects (`File > Save .py… / Open .py…`)

`lib/project/`: `serializeProject` writes the OpenSeesPy script (same `scriptCalls` pipeline as `exportScript`, with `annotate`) plus `# @pysees` JSON directives; `parseProject` reads it statically and
restores the whole authored project through the store's `loadProject`. Directives: `project` (version, ndm/ndf, id counters), `layout` (grids, levels), `report` (saved plots), `display`, `entity`
(pattern names, section templates, constraint ids), and `begin … end` blocks: `analysis` (the authored analysis command; the lowered calls between are skipped, so metadata is authoritative for analysis, disabled commands keep an empty block)
and `generated` (shell pressure / ShellDKGT self-weight, beam mass conversion for earthquakes, `misc`; header = authored definition, enclosed lines skipped even if hand-edited). Commands outside blocks stay authoritative.
Analysis is saved through the cursor. Any directive or required-command error blocks opening (`project` stays unset). Files without the header go through the model-only importer. Tcl export is unannotated. Tests: `lib/project/project.test.ts`.

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
`carapaceVsOpenSees.test.ts` runs every **verification case** (`lib/verification/cases.ts` + `newCases.ts`, run by `verify.ts`) in Carapace (the bundled wasm, loaded in Node) and in real OpenSees from the exported script, and requires displacements, reactions, element forces and shell resultants (velocities and accelerations on transient steps; frequencies and full mode shapes for modal cases) to agree step by step (relative tolerance `RTOL` 1e-5 against each quantity's largest OpenSees value; observed ~1e-6). A case with a documented formulation difference (P-Delta, shell mass, non-zero initial ground acceleration, corotational end shears) carries a looser `rtol` with its `why`, optionally for some `quantities` only; never loosen one to make a case pass. Exported shell pressure (and ShellDKGT self-weight) is added back to OpenSees' element forces before comparing (`shellPressureAdjust`). Cover a new element, material or analysis option by adding a case (model, plots, screenshot framing, Carapace `sources`) plus its description in `src/marketing/verification/content/<id>.md`. `carapace/unsupported.test.ts` requires a diagnostic for each unsupported input. Stud walls, diaphragms and joist floors are not compared (their export is an elastic-shell approximation).
- **Verification page** (`/verification`, `src/marketing/verification/`): the same cases for people. `VERIFY=1 npx vitest run src/app/lib/verification/generate.test.ts` (after committing case changes: pages link the case at the recorded commit) writes `src/marketing/verification/data/*.json` (metrics, downsampled plots, engine versions) and `public/verification/<id>.py` / `<id>.pysees.py`; then `node scripts/verification-screenshots.mjs` (dev server running) captures `<id>-model.webp` / `<id>-result.webp`. It refuses an OpenSeesPy other than `requirements-verify.txt`'s pin and a wasm that differs from `src/app/carapace/wasm/build-info.json` (written by `build-carapace.sh`). `freshness.test.ts` fails when the data no longer matches the cases, the wasm or the pin. `/studio?open=<same-origin path>` opens a project (`OpenFromUrl`).
Element force responses differ by element (`elementForceRecorders` in `analysisBlocks.ts`): OpenSees `force`
is global, so beams export `localForce` to match the local N/V/M PySees shows; trusses and zero-length elements report global forces and keep `force`; a group mixing shell types gets one file per type (rows of a file must have one width per element).

---

## Units

Carapace and OpenSees are unitless; the **model is stored in one consistent system** (`ModelConfig.units`: a length, force and time unit, chosen at init and fixed; absent = unitless model). Display units are presentation only (`unitPrefs` in the store, saved in the `display` directive; base units in the `project` directive): values convert at the UI boundary and are never stored converted.

- `lib/units/units.ts`: categories are dimensions as exponents of [L, F, T] (stress = F/L², mass = F·T²/L, ...). A category follows the displayed length/force/time ("auto", named when an alias matches exactly: kip/in² → ksi, N·s²/mm → t) until set explicitly. `makeUnitContext(base, prefs)` gives `toDisplay` / `fromDisplay` / `parse` (typed `4 ft`); `useUnits()` is the hook. Inactive (unitless) contexts convert and label nothing.
- `lib/units/quantities.ts`: `ArgDef.qty` tags, applied from `QTY_RULES` (keyed `fn` or `fn/Type`, then arg name) by `tagQuantities` inside `getAvailableSchemas`. An untagged arg is dimensionless and shows no unit. `units.test.ts` fails if a rule names an arg that no schema has. Section fiber/patch/layer args (custom editor) are not tagged yet.
- Per-DOF vecs use `dofForce` / `dofMass` (translational for the first ndm entries); `sp` uses `dofValue`.
- A uniaxial material has a `usage`, `stress-strain` (default; fibers, trusses) or `force-deformation` (springs), fixed at creation (form-only key `__usage`, saved in an `entity` directive). Its args are tagged by role (`mStress`, `mStrain`, `mModulus`) that the usage resolves to units. `MaterialPicker` filters by usage and `validateSchemaResult` rejects a mismatch.
- Field edits write back only when the text changed (no float drift), snapped to 12 significant digits.
- Planned: export with a unit prelude and `value*unit` tokens, results/plot conversion, section editor, templates/AISC/ground-motion conversion.

---

## Key Constraints

- Analysis is in-browser via Carapace; no OpenSees runtime, local agent, or server compute.
- ndm/ndf immutable after init.
- App-managed IDs for all entities.
- Anything the Carapace compiler can't yet express must surface as a compile diagnostic, not silently degrade.
- Exported scripts must remain valid OpenSeesPy.
- Results never enter the model or analysis history; they are derived and discarded when either changes.
- Scripting (`docs/SCRIPTINGPLAN.md`) is deferred.
