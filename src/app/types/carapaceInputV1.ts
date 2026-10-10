import type { ModalDampingAnchors } from '@/app/lib/rayleighDamping'
// Mirrors carapace/wasm-bridge/src/input_v1/{mod,tables,materials,sequence}.rs's serde (camelCase)
// wire shape — what decodeInput() in carapace_wasm expects (see src/app/lib/carapace/compileInputV1.ts,
// the only place that constructs one). One format serves 2D and 3D (`header.ndm`): the compiler targets
// ndm=2/ndf=3 and ndm=3/ndf=6, emitting the other profile's tables empty. Every table is optional on the wire; the ones this compiler always
// emits are required here, and tables it never emits (force beam-columns, zero-lengths, equal DOFs,
// diaphragms, rigid links, linear constraints, plane materials, triangles, quads) are left out. The model has no
// continuum elements yet; when it does, mirror `planeMaterials`/`triangles`/`quads` and the body/edge loads and
// `gaussPoint` recorders from carapace_wasm.d.ts.

export interface NodeTable { coords: number[]; fixed: number[]; massNodeIndex: number[]; mass: number[] }

export type TransformSpec = 'linear' | 'pDelta' | 'corotational'
/** 3D transformation: `vecXz` is a vector not parallel to the member axis, fixing its local y/z (OpenSees `vecxz`). */
export type TransformSpec3 = { kind: 'linear3'; vecXz: [number, number, number] } | { kind: 'pDelta3'; vecXz: [number, number, number] }
export type IntegrationSpec = { kind: 'legendre'; points: number } | { kind: 'lobatto'; points: number }

export interface TrussTable { nodeI: number[]; nodeJ: number[]; area: number[]; material: number[]; density: number[] }
export interface ElasticBeamColumn2dTable { nodeI: number[]; nodeJ: number[]; e: number[]; a: number[]; iz: number[]; transform: TransformSpec[]; density: number[] }
export interface ElasticBeamColumn3dTable { nodeI: number[]; nodeJ: number[]; e: number[]; g: number[]; a: number[]; j: number[]; iy: number[]; iz: number[]; transform: TransformSpec3[]; density: number[] }
/** 3D `DispBeamColumn`: `g`/`j` supply the decoupled elastic torsion (a fiber section carries none); no `corotational` flag. */
export interface FiberBeamColumn3dTable { nodeI: number[]; nodeJ: number[]; g: number[]; j: number[]; vecXz: [number, number, number][]; fiberSection: number[]; integration: IntegrationSpec[]; density: number[] }
export interface FiberBeamColumn2dTable { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; integration: IntegrationSpec[]; corotational: boolean[]; density: number[] }
/** Sparse OpenSees `-orient` row; rows without one use the global axes. 2D: `x = [x1, x2, 0]` and no `yp`; 3D adds `yp`. */
export interface OrientRow { row: number; x: [number, number, number]; yp?: [number, number, number] }
/** A `ZeroLength` driven by a coupled `FiberSection` (axial + moment) instead of independent per-DOF materials. `materials` is a sparse spring for the one DOF (`uy`) the section has no resultant for. */
export interface ZeroLengthSectionTable { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; materials: [number, number, number][]; orient?: OrientRow[] }
/** `z` is empty in 2D and parallel to `y` in 3D. */
/** Shell section arena entry (3D). Strain and resultants follow OpenSees' ElasticMembranePlateSection. */
export type ShellSectionSpec = { kind: 'elasticMembranePlate'; e: number; nu: number; h: number; rho: number }
/** 3-node DKT/Allman shells (ShellDKGT): `nodeIds` has stride 3, `section` indexes `shellSections`. */
export interface Shell3Table { nodeIds: number[]; section: number[] }
/** 4-node MITC4 shells: `nodeIds` has stride 4 (the node order fixes the normal), `section` indexes `shellSections`. */
export interface Shell4Table { nodeIds: number[]; section: number[] }
export interface FiberTable { sectionOffsets: number[]; y: number[]; z?: number[]; area: number[]; material: number[] }

/** Identity multi-point constraints (`core::Domain::equal_dof`): row `i` ties `constrained[i]`'s
 * dofs listed in `dofs` (sparse `(row, dof)` pairs) exactly to the same dofs of `retained[i]`. */
export interface EqualDofTable { retained: number[]; constrained: number[]; dofs: [number, number][] }
/** 2D rigid diaphragm (`core::Domain::rigid_diaphragm`): row `i` ties every node listed
 * against it in `constrained` (sparse `(row, nodeIndex)` pairs) own `ux` to `retained[i]`'s `ux`. */
export interface RigidDiaphragmTable { retained: number[]; constrained: [number, number][] }

export type TimeSeriesSpec = { kind: 'constant' } | { kind: 'linear'; slope: number } | { kind: 'path'; times: number[]; factors: number[] } | { kind: 'boundedPath'; times: number[]; factors: number[]; useLast: boolean }
export interface LoadPatternTable { series: TimeSeriesSpec[]; scaleFactor: number[] }
export interface NodalLoadTable { pattern: number[]; node: number[]; dof: number[]; value: number[]; stage: number[] }

export type ElementKind = 'truss' | 'elasticBeamColumn2d' | 'elasticBeamColumn3d' | 'dispBeamColumn2d' | 'dispBeamColumn3d' | 'forceBeamColumn2d' | 'forceBeamColumn3d' | 'zeroLength' | 'zeroLengthSection' | 'tri3' | 'quad4' | 'shell3' | 'shell4'
/** Uniform load per length in the element's local axes: `wx` along the member, `wy` (and, in 3D, `wz`) transverse.
 * Shells take a pressure per area along the local normal, or a body acceleration in global axes (force per area `rho h b`). */
export type ElementLoadSpec = { kind: 'uniform'; wx: number; wy: number; wz?: number } | { kind: 'shellPressure'; pressure: number } | { kind: 'shellBody'; bx: number; by: number; bz: number }
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
export type AlgorithmSpec =
  | { kind: 'linear' }
  | { kind: 'newton'; tangent?: 'current' | 'reuseAtStepStart' | 'initial'; lineSearch?: { kind: 'bisection' | 'regulaFalsi'; tol: number; maxIter: number; maxEta: number } }
  | { kind: 'krylovNewton'; tangent: 'current' | 'reuseAtStepStart' | 'initial'; maxDimension: number }
export type ConvergenceSpec =
  | { kind: 'normUnbalance'; tol: number; maxIter: number }
  | { kind: 'normDispIncr'; tol: number; maxIter: number }
  | { kind: 'energyIncr'; tol: number; maxIter: number }
export type StageSpec =
  | {
      kind: 'static'
      id: string
      steps: number
      integrator: IntegratorSpec
      algorithm: AlgorithmSpec
      convergence?: ConvergenceSpec
      holdPatternsAfter: number[]
    }
  | { kind: 'modal'; id: string; modes: number }
  | { kind: 'reset'; id: string }
  | { kind: 'transient'; id: string; steps: number; dt: number; damping: { alphaM: number; betaK: number; modalAnchors?: ModalDampingAnchors }; groundMotions: { direction: number; series: TimeSeriesSpec; scaleFactor: number }[]; algorithm: AlgorithmSpec; convergence?: ConvergenceSpec }
/** Scalar recorder channels stored by the browser results worker. Acceleration and velocity are relative to the ground. */
export type RecorderSpecWire =
  | { response: 'nodeDisp'; node: number; dof: number }
  | { response: 'nodeVel'; node: number; dof: number }
  | { response: 'nodeAccel'; node: number; dof: number }
  | { response: 'reaction'; node: number; dof: number }
  | { response: 'elementForce'; elementKind: ElementKind; elementIndex: number; component: number }
  /** The uniform load the element carries at each sample (local axes; component 0 = wx, 1 = wy; the 2D wire row is 16 wide, the rest are continuum body/edge terms the compiler never reads). */
  | { response: 'elementLoad'; elementKind: ElementKind; elementIndex: number; component: number }
  /** One shell resultant (`component` 0..8: Nx Ny Nxy Mx My Mxy Qx Qy, OpenSees' order and sign) at Gauss point `point` (0..4). */
  | { response: 'gaussPoint'; elementKind: ElementKind; elementIndex: number; point: number; quantity: 'stress' | 'strain'; component: number }
export interface SequenceSpec { stages: StageSpec[]; recorders: RecorderSpecWire[] }

export interface CarapaceInputV1 {
  header: { schemaVersion: number; ndm: 2 | 3; engineVersion: string; recordInitial?: boolean }
  nodes: NodeTable
  materials: MaterialSpec[]
  fibers: FiberTable
  trusses: TrussTable
  elasticBeamColumns2d: ElasticBeamColumn2dTable
  dispBeamColumns2d: FiberBeamColumn2dTable
  elasticBeamColumns3d?: ElasticBeamColumn3dTable
  dispBeamColumns3d?: FiberBeamColumn3dTable
  zeroLengthSections: ZeroLengthSectionTable
  shellSections?: ShellSectionSpec[]
  shell3s?: Shell3Table
  shell4s?: Shell4Table
  loadPatterns: LoadPatternTable
  nodalLoads: NodalLoadTable
  elementLoads: ElementLoadTable
  sequence: SequenceSpec
}
