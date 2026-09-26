// Mirrors carapace/wasm-bridge/src/input_v1/{mod,tables,tables3,materials,sequence}.rs's serde
// (camelCase) wire shape exactly — every field `CarapaceInputV1` declares is required by serde
// (no `#[serde(default)]` anywhere on that struct), so a value missing even one field fails
// decodeInput() outright. This is what decodeInput() in carapace_wasm expects — see
// src/app/lib/carapace/compileInputV1.ts, the only place that constructs one; that compiler only
// ever targets the planar profile (ndm=2/ndf=3), so every `*3` (spatial) field it emits is always
// an empty table, but still has to be *present* and correctly shaped.

export interface NodeTable { coords: number[]; fixed: number[]; massNodeIndex: number[]; mass: number[] }

export type TransformSpec = 'linear' | 'pDelta' | 'corotational'
export type IntegrationSpec = { kind: 'legendre'; points: number } | { kind: 'lobatto'; points: number }

export interface TrussTable { nodeI: number[]; nodeJ: number[]; area: number[]; material: number[]; density: number[] }
export interface ElasticBeamColumnTable { nodeI: number[]; nodeJ: number[]; e: number[]; a: number[]; iz: number[]; transform: TransformSpec[]; density: number[] }
export interface FiberBeamColumnTable { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; integration: IntegrationSpec[]; corotational: boolean[]; density: number[] }
/** `materials`: sparse `(row, dof, materialArenaIndex)`. `friction`: sparse `(row, normalDof, shearDof, mu, k0, b)`, at most one per row. */
export interface ZeroLengthTable { nodeI: number[]; nodeJ: number[]; materials: [number, number, number][]; friction: [number, number, number, number, number, number][] }
/** A `ZeroLength` driven by a coupled `FiberSection` (axial + moment) instead of independent per-DOF materials. `materials` is a sparse spring for the one DOF (`uy`) the section has no resultant for. */
export interface ZeroLengthSectionTable { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; materials: [number, number, number][] }
export interface FiberTable { sectionOffsets: number[]; y: number[]; area: number[]; material: number[] }

/** Identity multi-point constraints (`core::Domain::equal_dof`): row `i` ties `constrained[i]`'s
 * dofs listed in `dofs` (sparse `(row, dof)` pairs) exactly to the same dofs of `retained[i]`. */
export interface EqualDofTable { retained: number[]; constrained: number[]; dofs: [number, number][] }
/** Planar rigid diaphragm (`core::Domain::rigid_diaphragm`): row `i` ties every node listed
 * against it in `constrained` (sparse `(row, nodeIndex)` pairs) own `ux` to `retained[i]`'s `ux`. */
export interface RigidDiaphragmTable { retained: number[]; constrained: [number, number][] }

export type TimeSeriesSpec = { kind: 'constant' } | { kind: 'linear'; slope: number } | { kind: 'path'; times: number[]; factors: number[] }
export interface LoadPatternTable { series: TimeSeriesSpec[]; scaleFactor: number[] }
export interface NodalLoadTable { pattern: number[]; node: number[]; dof: number[]; value: number[]; stage: number[] }

export type ElementKind = 'truss' | 'elasticBeamColumn' | 'dispBeamColumn' | 'forceBeamColumn' | 'zeroLength' | 'zeroLengthSection'
export type ElementLoadSpec = { kind: 'uniformTransverse'; w: number }
export interface ElementLoadTable { pattern: number[]; elementKind: ElementKind[]; elementIndex: number[]; load: ElementLoadSpec[]; stage: number[] }

export type MaterialSpec =
  | { kind: 'elastic'; e: number }
  | { kind: 'elasticPp'; e: number; eyp: number }
  | { kind: 'gap'; e: number; gap: number }
  | { kind: 'ent'; e: number }
  | { kind: 'steel01'; fy: number; e0: number; b: number; a1: number; a2: number; a3: number; a4: number }
  | { kind: 'concrete01'; fpc: number; epsc0: number; fpcu: number; epscu: number }
  | { kind: 'steel02'; fy: number; e0: number; b: number; r0: number; cr1: number; cr2: number; a1: number; a2: number; a3: number; a4: number }
  | { kind: 'concrete02'; fc: number; epsc0: number; fcu: number; epscu: number; rat: number; ft: number; ets: number }
  | { kind: 'parallel'; children: [number, number][] }
  | { kind: 'series'; children: number[] }
  | { kind: 'minMax'; inner: number; minStrain: number; maxStrain: number }

export type IntegratorSpec =
  | { kind: 'loadControl'; increment: number }
  | { kind: 'displacementControl'; node: number; dof: number; increment: number }
export type AlgorithmSpec = 'linear' | 'newtonRaphson'
export type ConvergenceSpec =
  | { kind: 'normUnbalance'; tol: number; maxIter: number }
  | { kind: 'normDispIncr'; tol: number; maxIter: number }
  | { kind: 'energyIncr'; tol: number; maxIter: number }
/** Only the `static` stage kind is modeled here — `compileInputV1.ts` only ever emits that kind
 * (see `compileStage`'s own "not yet supported" diagnostic for `modal`/`transient` stages); the
 * Rust `StageSpec` enum also has `Modal`/`Transient` variants this compiler doesn't produce yet. */
export type StageSpec = {
  kind: 'static'
  id: string
  steps: number
  integrator: IntegratorSpec
  algorithm: AlgorithmSpec
  convergence: ConvergenceSpec | null
  holdPatternsAfter: number[]
}
/** Only the `nodeDisp` recorder kind is modeled here — `compileInputV1.ts` only ever emits that
 * kind (see its own "only node displacement recorders are supported" diagnostic); the Rust
 * `RecorderSpec` enum (internally tagged on `response`) also has `nodeVel`/`nodeAccel`/
 * `elementForce`/`modeShape`/`reaction`/`fiber` variants this compiler doesn't produce yet. */
export interface RecorderSpecWire { response: 'nodeDisp'; node: number; dof: number }
export interface SequenceSpec { stages: StageSpec[]; recorders: RecorderSpecWire[] }

// --- Spatial ("space: 3") counterparts -------------------------------------------------------
// `compileInputV1.ts` targets the planar profile only, so every value below is always an empty
// table — these types exist purely so that empty table is *correctly shaped* (`CarapaceInputV1`
// requires every field, planar or spatial, to be present regardless of `header.space`).

export interface NodeTable3 { coords: number[]; fixed: number[]; massNodeIndex: number[]; mass: number[] }
export type TransformSpec3 = { kind: 'linear3'; vecXz: [number, number, number] } | { kind: 'pDelta3'; vecXz: [number, number, number] }
export interface TrussTable3 { nodeI: number[]; nodeJ: number[]; area: number[]; material: number[]; density: number[] }
export interface ElasticBeamColumnTable3 { nodeI: number[]; nodeJ: number[]; e: number[]; g: number[]; a: number[]; j: number[]; iy: number[]; iz: number[]; transform: TransformSpec3[]; density: number[] }
export interface FiberBeamColumnTable3 { nodeI: number[]; nodeJ: number[]; g: number[]; j: number[]; vecXz: [number, number, number][]; fiberSection: number[]; integration: IntegrationSpec[]; density: number[] }
export interface ZeroLengthTable3 { nodeI: number[]; nodeJ: number[]; materials: [number, number, number][]; friction: [number, number, number, number, number, number, number][] }
export interface ZeroLengthSectionTable3 { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; materials: [number, number, number][] }
export interface FiberTable3 { sectionOffsets: number[]; y: number[]; z: number[]; area: number[]; material: number[] }
export type ElementKind3 = 'truss' | 'elasticBeamColumn' | 'dispBeamColumn' | 'forceBeamColumn' | 'zeroLength' | 'zeroLengthSection'
export type ElementLoadSpec3 = { kind: 'uniformTransverse'; wy: number; wz: number }
export interface ElementLoadTable3 { pattern: number[]; elementKind: ElementKind3[]; elementIndex: number[]; load: ElementLoadSpec3[]; stage: number[] }
export type Axis3Spec = 'x' | 'y' | 'z'
export interface EqualDofTable3 { retained: number[]; constrained: number[]; dofs: [number, number][] }
export interface RigidDiaphragmTable3 { retained: number[]; normal: Axis3Spec[]; constrained: [number, number][] }
/** `stages` reuses the planar `StageSpec` (the Rust `SequenceSpec3` does too — stage/integrator
 * compilation never touches element physics). `recorders` is never populated by this compiler. */
export interface SequenceSpec3 { stages: StageSpec[]; recorders: unknown[] }

export interface CarapaceInputV1 {
  header: { schemaVersion: number; space: 2; engineVersion: string }
  nodes: NodeTable
  materials: MaterialSpec[]
  fibers: FiberTable
  trusses: TrussTable
  elasticBeamColumns: ElasticBeamColumnTable
  dispBeamColumns: FiberBeamColumnTable
  forceBeamColumns: FiberBeamColumnTable
  zeroLengths: ZeroLengthTable
  zeroLengthSections: ZeroLengthSectionTable
  equalDofs: EqualDofTable
  rigidDiaphragms: RigidDiaphragmTable
  loadPatterns: LoadPatternTable
  nodalLoads: NodalLoadTable
  elementLoads: ElementLoadTable
  sequence: SequenceSpec

  nodes3: NodeTable3
  fibers3: FiberTable3
  trusses3: TrussTable3
  elasticBeamColumns3: ElasticBeamColumnTable3
  dispBeamColumns3: FiberBeamColumnTable3
  forceBeamColumns3: FiberBeamColumnTable3
  zeroLengths3: ZeroLengthTable3
  zeroLengthSections3: ZeroLengthSectionTable3
  equalDofs3: EqualDofTable3
  rigidDiaphragms3: RigidDiaphragmTable3
  /** Nodal loads for the spatial profile reuse `NodalLoadTable` as-is (Rust's own field comment). */
  nodalLoads3: NodalLoadTable
  elementLoads3: ElementLoadTable3
  sequence3: SequenceSpec3
}
