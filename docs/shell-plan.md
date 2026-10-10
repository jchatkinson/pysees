# 3D elastic shells: plan across PySees and Carapace

Status: implemented. `ShellMITC4` (`shell4s`) and `ShellDKGT` (`shell3s`) run in Carapace and match OpenSees; PySees has the model, script I/O, compile, export, viewport, a stress-resultant contour and a Plate template. Not done: MacNeal-Harder twisted-beam and cantilever benchmarks (Scordelis-Lo, tilted/distorted patches, a warped quad, a column framing into a shell and plate closed-form checks are in `carapace/core/tests/shells`).

Differences from OpenSees found while implementing:
- `ShellMITC4` and `ShellDKGT` have a consistent translational mass; Carapace lumps it (row sums), so modal frequencies agree only approximately.
- `ShellMITC4` applies `-selfWeight` with the opposite sign of a gravity vector and includes it in the element's resisting force, so Carapace's body load is `+rho h b` and the exporter negates it. `ShellDKGT` also applies twice the self-weight (its integration weight lacks the 0.5 the mass and stiffness use), so the exporter writes a triangle's self-weight as nodal loads instead.
- Carapace reports a loaded shell's element force net of its pressure and self-weight; OpenSees (where pressure is a nodal load) does not, so pressured fixtures skip the element-force comparison.

## TODO: stiffness modifiers (breaks OpenSees compatibility)

ETABS-style modifiers on the shell section, each scaling one term of `D`: membrane `f11 f22 f12`, bending `m11 m22 m12`, transverse shear `v13 v23` (MITC4 only), all defaulting to 1.

- **Carapace:** an optional `modifiers` object on `ShellSection::ElasticMembranePlate` and on the wire `ShellSectionSpec`. The coupling terms `D12` scale by `sqrt(f11 f22)` and `sqrt(m11 m22)` so `D` stays symmetric positive definite. Elements need no change (they take `D` from `section.tangent()`); the drilling penalty follows the modified membrane block. Resultants come from the modified stiffness.
- **PySees:** PySees-only data on the section entity (`args.modifiers`), a "Stiffness modifiers" group in the section form, passed through `compileShellSections`. Section-level first; per-element modifiers later if needed.
- **OpenSees compatibility:** `ElasticMembranePlateSection` has only `Ep_modifier`, so this feature cannot round-trip. Export is exact only when all `f` are equal and all `m` are equal (write `E*f` and `Ep_modifier = m/f`; OpenSees also scales shear by that ratio, so `v` must equal it). Anything else must produce an export diagnostic, not silently unmodified stiffness, and the OpenSees comparison tests skip such models. Import cannot recover the factors.

## Results format

A shell records its stress resultants, not strains: `shell:<elementTag>` recorders in the results store (`RecorderKind` `'shell'`), 32 columns per element, point-major over the 4 Gauss points (`Nx#1`..`Qy#1`, `Nx#2`..), in the element's local axes with OpenSees' order and sign (what `eleResponse(tag, 'stresses')` returns, so the OpenSees comparison reads the same layout). Both element types have 4 Gauss points. On the wire they are `gaussPoint` recorders (`quantity: stress`, `component` 0..8). Element forces stay the global nodal forces (`force:<tag>`, 24 or 18 columns).

The contour view (`ResultType` `contour`, with `ResultsView.contour` the component) reads these columns: each shell's Gauss values are extrapolated to its corners (bilinear for the quad, the linear field through the three outer points for the triangle), averaged at shared nodes and coloured on the deformed shape at the deformed scale. The range is the displayed step's min and max.

## Scope (v1)

- Elements: 4-node `ShellMITC4` first; 3-node `ShellDKGT` once the quad matches OpenSees.
- Section: `ElasticMembranePlateSection` (E, nu, h, rho).
- Loads: nodal loads, self-weight, and constant normal pressure per shell.
- Analysis: static and modal. 3D models only.
- Deferred: `ShellDKGT`, layered/nonlinear shells, varying pressure, a mesh tool (separate work).

## Current state

- Carapace: `ElementOps` (sinks, `DofMask`, `MAX_ELEMENT_NODES = 4`) already supports 4-node elements; 2D `Tri3`/`Quad4` use it. `Element3` is still two-node only (`nodes() -> [Node3Id; 2]`, `form_*` take `node_i, node_j`). `ElementLoad3` is a single-variant enum (`Uniform`). `GaussResponse` is fixed at 3 components.
- PySees: no continuum elements at all. `decode.ts` does `.slice(0, 2)` on nodes; the viewport draws elements as line segments only (`sceneIndex`, `Elements.tsx`); `compileInputV1` has beam/truss tables only. `ElementEntity.nodes` is already an array.
- OpenSees: `ShellMITC4`, `ShellDKGT` and `ElasticMembranePlateSection` exist in the generated schemas.

## Phase 1: Carapace core

1. `ShellSection` seam in `model/materials/` (mirror `PlaneMaterial`): closed enum, trial/commit, one copy per Gauss point. `ElasticMembranePlate{e, nu, h, rho}` gives membrane D (3x3), bending D (h^3/12 * D) and transverse shear (5/6 G h).
2. `Shell4` (`elements/shell4.rs`; `Shell3` later):
   - Local frame as OpenSees `computeBasis` (e1 from edge midpoints, e3 = e1 x v2, e2 = e3 x e1) so local resultants match.
   - 6 DOFs per node, `dof_mask` all six; membrane + MITC4 bending/shear + drilling term.
   - `validate` (degenerate/warped geometry), `prepare` (cache B, detJ*w), lumped mass, `commit`, `local_force` width 24.
   - Reuse `model/continuum` (`shape`, `quadrature`, `jacobian`) for the surface mapping.
3. `Element3`: add shell variants and route them through the sink-based `ElementOps` path, as 2D does for `Tri3`/`Quad4` (two-node arms `unreachable!`, `nodes()` returns `NodeList`). Add to the mask-conformance test in `elements/mod.rs`.
4. Responses: widen `GaussResponse` (or add a shell variant) to 8 generalized strains/resultants (N, M, Q); update the `gaussPoint` recorder.
5. Loads: `ElementLoad3` gains a body component (self-weight) and a pressure component (struct like 2D `ElementLoad`, additive). `accepts_load` is true for shells only.
   - Pressure is positive along the local normal e3 (right-hand rule from node order).
   - Equivalent nodal force is the consistent integral `p * int N_i * e3 * detJ` at the Gauss points, translations only. Not `p*A/n`: the two agree for parallelograms and triangles but not for general quads.

## Phase 2: Wire format (`input_v1`)

- `shellSections` arena; `shell4s` / `shell3s` tables; `ElementKind::Shell4` / `Shell3` with `only_ndm = 3`; the 2D decoder rejects them via `reject_tables`.
- `elementLoads` gains a `shellPressure` kind; any non-shell target is `unsupportedElementLoad`.
- Recorder validation for the new responses, new `DecodeError` variants.
- Update `docs/input-format.md`, native-vs-wire tests, `boundary-smoke.ts`.
- Rebuild wasm with `scripts/build-carapace.sh`.

## Phase 3: PySees model and script I/O

- `commands/tables.ts`: `ElementSpec.nodeCount`; add `ShellMITC4` and `ShellDKGT` (`args: ['secTag']`).
- `decode.ts` / `encode.ts`: use `spec.nodeCount` instead of the hard-coded two nodes.
- Section: check `ElasticMembranePlateSection` (string-typed `eMod`, `nu`, `h`) through the form and codec; fix in `scripts/schema-patches.json` with a `_why`, not in the generated file.
- `commandSchemas.ts`: add shell types to the Element Type choice; validate node count, existing section, 3D model.
- Pressure load: `eleLoad` child of a pattern, args `{eleTags, pressure}`; form validates all tags are shells.
- Tests: round-trip and golden in both languages, plus the real-OpenSees export test.

## Phase 4: Compile and export

- `compileInputV1.ts` / `types/carapaceInputV1.ts`: compile sections into the arena, emit shell tables and pressure loads; diagnostic for shells in 2D models or unsupported section types.
- `elementForceRecorders` / `LOCAL_FORCE_ELEMENTS` (`analysisBlocks.ts`): handle shell force vectors; OpenSees `force` is global, so pick the recorder to match what PySees shows.
- **Pressure export.** OpenSees `ShellMITC4` has no pressure load (checked in the repo's OpenSeesPy: `-surfaceLoad` is rejected as load type 9, `-shellPressure` is silently ignored). So `exportScript.ts` expands pressure into nodal loads:
  - Per pattern, sum the equivalent nodal force from every pressured shell touching a node (same consistent integral as Carapace), and write one `ops.load(node, Fx, Fy, Fz, 0, 0, 0)` per node with a comment naming the source elements.
  - A user's own nodal load on the same node stays a separate line.
  - This needs a small TypeScript copy of the shape-function integration; cross-check it against the Rust version in tests.
  - Carapace keeps pressure as an element load, so it solves exactly what the exported nodal loads describe and the 1e-5 comparison stays valid.
- Import cannot turn nodal loads back into pressure. Exclude pressure fixtures from the `roundtrip.test.ts` equality check; cover them with a golden file (expanded form) and the OpenSees comparison. Script import warns on `-shellPressure` / `-surfaceLoad` shell loads.

## Phase 5: Viewport and results

- Polygon geometry in `sceneIndex` / `displayBuffers`: translucent filled surface plus outline, surface picking, selection highlight, labels, deformed shape.
- Pressure glyphs (arrows along the normal, scaled by value) in `Loads.tsx`.
- Later: contours of N, M, Q from the new Gauss responses.
- Creating many shells: a 3D template (cantilever plate or slab on columns). The mesh tool is separate work, not part of this plan.

## Phase 6: Validation

All against OpenSees via `carapaceVsOpenSees.test.ts` (relative tolerance 1e-5), plus native tests:

- Patch and rigid-body tests; single-element closed-form checks.
- MacNeal-Harder: cantilever (in-plane and out-of-plane tip loads), twisted beam; Scordelis-Lo roof.
- Flat square plate under uniform pressure vs the closed-form plate solution; distorted quad whose nodal forces sum to `p * area`.
- Modal comparison; shells sharing nodes with beams.

## Risks

- Exact agreement with OpenSees depends on its drilling-DOF treatment, shear correction and mass lumping. Read the OpenSees `ShellMITC4` source (or probe it through OpenSeesPy) before writing the element.
- Warped quads: decide whether to tolerate them as OpenSees does.

## Decisions

1. Quad first (`ShellMITC4`); `ShellDKGT` follows once the quad matches OpenSees.
2. No mesh tool in v1; it is being developed separately after the formulation is finished. Shells come from a template and script import.
3. Pressure fixtures are excluded from the `roundtrip.test.ts` equality check.
