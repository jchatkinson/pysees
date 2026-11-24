import type { ModalDampingAnchors } from '@/app/lib/rayleighDamping'
// Mirrors carapace/wasm-bridge/src/input_v1/{mod,tables,materials,sequence}.rs's serde (camelCase)
// wire shape — what decodeInput() in carapace_wasm expects (see src/app/lib/carapace/compileInputV1.ts,
// the only place that constructs one). One format serves 2D and 3D (`header.ndm`): the compiler targets
// ndm=2/ndf=3 and ndm=3/ndf=6, emitting the other profile's tables empty. Every table is optional on the wire; tables this compiler emits are optional in the wire type so a native
// building input can contain only header/building/sequence. Tables this compiler never emits (force beam-columns, zero-lengths, equal DOFs,
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
/** Coulomb friction on one `zeroLengths` row: shear DOF `shearDofs[0]` slides against the current force in `normalDof` (compression negative; capacity `mu * max(-N, 0)`), sticking with stiffness `k0` and sliding with tangent `b * k0`. 0-based DOFs. `normalDof` needs its own material on the row; the shear DOF must not. */
export interface FrictionRow { row: number; normalDof: number; shearDofs: number[]; mu: number; k0: number; b: number }
/** Independent per-DOF materials between two nodes (`materials` is sparse `[row, dof, materialIndex]`, 0-based DOFs), optionally with friction coupling and local axes. */
export interface ZeroLengthTable { nodeI: number[]; nodeJ: number[]; materials: [number, number, number][]; friction?: FrictionRow[]; orient?: OrientRow[] }
export interface ZeroLengthSectionTable { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; materials: [number, number, number][]; orient?: OrientRow[] }
/** `z` is empty in 2D and parallel to `y` in 3D. */
/** ETABS-style stiffness modifiers on a shell section; each omitted factor is 1 and each must be finite and positive.
 * `f11 f22 f12` scale the membrane terms, `m11 m22 m12` the bending terms and `v13 v23` the transverse shear (no effect on `shell3s`).
 * OpenSees has no equivalent: results match only when all `f` equal `f`, all `m` equal `m` and `v13 = v23 = m` (export `E*f`, `Ep_modifier = m/f`). */
export interface ShellModifiersSpec { f11?: number; f22?: number; f12?: number; m11?: number; m22?: number; m12?: number; v13?: number; v23?: number }
/** Shell section arena entry (3D). Strain and resultants follow OpenSees' ElasticMembranePlateSection. */
export type ShellSectionSpec = { kind: 'elasticMembranePlate'; e: number; nu: number; h: number; rho: number; modifiers?: ShellModifiersSpec }
/** 3-node DKT/Allman shells (ShellDKGT): `nodeIds` has stride 3, `section` indexes `shellSections`. */
export interface Shell3Table { nodeIds: number[]; section: number[] }
/** 4-node MITC4 shells: `nodeIds` has stride 4 (the node order fixes the normal), `section` indexes `shellSections`. */
export interface Shell4Table { nodeIds: number[]; section: number[] }
export interface FiberTable { sectionOffsets: number[]; y: number[]; z?: number[]; area: number[]; material: number[] }

/** Identity multi-point constraints (`core::Domain::equal_dof`): row `i` ties `constrained[i]`'s
 * dofs listed in `dofs` (sparse `(row, dof)` pairs) exactly to the same dofs of `retained[i]`. */
export interface EqualDofTable { retained: number[]; constrained: number[]; dofs: [number, number][] }
/** Rigid diaphragm: row `i` ties every node listed against it in `constrained` (sparse `(row, nodeIndex)` pairs) to `retained[i]`. In 2D
 * only `ux`; in 3D the two translations in the plane normal to `normal[i]` (with the lever arm of the retained node's rotation about it).
 * `normal` is 3D only (default Y). The constrained nodes' rotation about the normal is not tied; add an `equalDofs` row for that. */
export interface RigidDiaphragmTable { retained: number[]; normal?: Axis3Spec[]; constrained: [number, number][] }
export type Axis3Spec = 'x' | 'y' | 'z'
/** Rigid links (`core::Domain::rigid_link`): `slave[i]` moves with `master[i]` as a rigid body (small rotations, lever arm from the coordinates). */
export interface RigidLinkTable { master: number[]; slave: number[] }
/** General linear constraints: row `i` sets `u[slaveNode[i], slaveDof[i]] = sum termCoeff * u[termNode, termDof]` over the terms
 * `termOffsets[i]..termOffsets[i + 1]`. `termOffsets` has rows + 1 entries. Node indices and 0-based dofs. */
export interface LinearConstraintTable { slaveNode: number[]; slaveDof: number[]; termOffsets: number[]; termNode: number[]; termDof: number[]; termCoeff: number[] }

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
  | { kind: 'hysteretic'; mom1p: number; rot1p: number; mom2p: number; rot2p: number; mom3p: number; rot3p: number; mom1n: number; rot1n: number; mom2n: number; rot2n: number; mom3n: number; rot3n: number; pinchX: number; pinchY: number; damfc1: number; damfc2: number; beta: number }
  | { kind: 'pinching4'; stress1p: number; strain1p: number; stress2p: number; strain2p: number; stress3p: number; strain3p: number; stress4p: number; strain4p: number; stress1n: number; strain1n: number; stress2n: number; strain2n: number; stress3n: number; strain3n: number; stress4n: number; strain4n: number; rDispP: number; rForceP: number; uForceP: number; rDispN: number; rForceN: number; uForceN: number; gammaKParams: [number, number, number, number]; gammaKLimit: number; gammaDParams: [number, number, number, number]; gammaDLimit: number; gammaFParams: [number, number, number, number]; gammaFLimit: number; gammaE: number; dmgCyc: 'energyBased' | 'cycleBased' }

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
/** Recorder channels stored by the browser results worker. Acceleration and velocity are relative to the ground. */
export type RecorderSpecWire =
  | { response: 'buildingWallPier'; storey: number; wall: string; pier: number; quantity: StudWallQuantity }
  /** A named wall's total base reaction in its local axes: shear, axial (up positive: the gravity takedown is positive) and moment about the wall centre. */
  | { response: 'buildingWallBase'; storey: number; wall: string; component: StudWallBaseComponent }
  | { response: 'buildingStoreyDrift'; storey: number; component: BuildingDriftComponent }
  | { response: 'nodeDisp'; node: number; dof: number }
  | { response: 'nodeVel'; node: number; dof: number }
  | { response: 'nodeAccel'; node: number; dof: number }
  | { response: 'reaction'; node: number; dof: number }
  | { response: 'elementForce'; elementKind: ElementKind; elementIndex: number; component: number }
  /** The uniform load the element carries at each sample (local axes; component 0 = wx, 1 = wy; the 2D wire row is 16 wide, the rest are continuum body/edge terms the compiler never reads). */
  | { response: 'elementLoad'; elementKind: ElementKind; elementIndex: number; component: number }
  /** One shell resultant (`component` 0..8: Nx Ny Nxy Mx My Mxy Qx Qy, OpenSees' order and sign) at Gauss point `point` (0..4). */
  | { response: 'gaussPoint'; elementKind: ElementKind; elementIndex: number; point: number; quantity: 'stress' | 'strain'; component: number }
  /** A whole node or element table (or the `rows` of it, in that order) per step, as one flat Float64Array: row, then Gauss point, then component. */
  | { response: 'bulk'; table: 'nodes' | 'elements'; quantity: BulkQuantity; elementKind?: ElementKind; rows?: number[] }
/** `nodes`: displacement, reaction, velocity, acceleration (ndf each). `elements`: endForce (the elementForce components), load (wx, wy(, wz)), stress / strain (shell resultants per Gauss point). */
export type BulkQuantity = 'displacement' | 'reaction' | 'velocity' | 'acceleration' | 'endForce' | 'load' | 'stress' | 'strain'
export interface SequenceSpec { stages: StageSpec[]; recorders: RecorderSpecWire[] }

export interface BuildingSpec { storeys: StoreySpec[]; foundationAnchorage: AnchorageSpec; diaphragm: DiaphragmKind; combination?: [number, number, number, number, number, number, number, number] }
export interface StoreySpec { wallHeight: number; floorDepth: number; bandGa: number; rimEa: number; anchorage: AnchorageSpec; bearing: number; walls: WallSpec[]; floors?: FloorSpec[]; lateral?: LateralLoad[] }
export interface AnchorageSpec { tension: number; slack: number; bearing: AnchorageBearingSpec }
export type AnchorageBearingSpec = { kind: 'linear'; k: number } | { kind: 'o86Crush'; qr: number }
export type DiaphragmKind = 'rigid' | 'flexible'
export interface WallSpec { name: string; start: [number, number]; direction: [number, number]; layout: WallLayoutSpec; loads?: SlotWallLoad[] }
export interface SlotWallLoad { slot: number; load: WallLoadSpec }
export interface WallLayoutSpec { length: number; height: number; studs: WallStudSpec[]; topEa: number; topEi: number | undefined; topDistribution: ChordDistributionSpec; bottomEa: number; bottomEi: number; openings?: WallOpeningSpec[]; sheathing: WallSheathingSpec | undefined; foundation?: boolean }
export interface WallStudSpec { x: number; ea: number }
export interface WallOpeningSpec { x0: number; x1: number; headHeight: number; headerEi: number; jackEa: number; door: boolean }
export type ChordDistributionSpec = 'beam' | 'direct'
export interface WallSheathingSpec { law: WallShearLawSpec }
export type WallShearLawSpec = { kind: 'linear'; ga: number } | { kind: 'o86'; bv: number; nailSpacing: number; nailDiameter: number }
export type WallLoadSpec = { kind: 'topPoint'; x: number; fx: number; fy: number } | { kind: 'topLine'; x0: number; x1: number; wx0: number; wx1: number; wy0: number; wy1: number }
/** `bounds` is the plan rectangle `[x0, x1, z0, z1]`; load coordinates `s` run along the span and `t` across it. */
export interface FloorSpec { bounds: [number, number, number, number]; supports: string[]; spanAxis: SpanAxis; loads: FloorLoadSpec[]; continuity: FloorContinuitySpec }
export type SpanAxis = 'x' | 'z'
export type FloorContinuitySpec = 'simple' | 'continuous'
export type FloorLoadSpec = { kind: 'area'; slot: number; w: number; region?: [number, number, number, number] | null } | { kind: 'line'; slot: number; w: number; s: number; t0: number; t1: number } | { kind: 'lineAlong'; slot: number; w: number; t: number; s0: number; s1: number } | { kind: 'point'; slot: number; p: number; s: number; t: number }
export interface LateralLoad { slot: number; fx: number; fz: number; at: [number, number] }
export type StudWallQuantity = 'q' | 'gamma' | 'momentBase' | 'momentTop' | 'chordLeft' | 'chordRight'
export type BuildingDriftComponent = 'x' | 'z' | 'rotation'
export type StudWallBaseComponent = 'shear' | 'axial' | 'moment'

export interface CarapaceInputV1 {
  header: { schemaVersion: number; ndm: 2 | 3; engineVersion: string; recordInitial?: boolean }
  building?: BuildingSpec
  nodes?: NodeTable
  materials?: MaterialSpec[]
  fibers?: FiberTable
  trusses?: TrussTable
  elasticBeamColumns2d?: ElasticBeamColumn2dTable
  dispBeamColumns2d?: FiberBeamColumn2dTable
  elasticBeamColumns3d?: ElasticBeamColumn3dTable
  dispBeamColumns3d?: FiberBeamColumn3dTable
  zeroLengths?: ZeroLengthTable
  zeroLengthSections?: ZeroLengthSectionTable
  equalDofs?: EqualDofTable
  rigidDiaphragms?: RigidDiaphragmTable
  rigidLinks?: RigidLinkTable
  linearConstraints?: LinearConstraintTable
  shellSections?: ShellSectionSpec[]
  shell3s?: Shell3Table
  shell4s?: Shell4Table
  loadPatterns?: LoadPatternTable
  nodalLoads?: NodalLoadTable
  elementLoads?: ElementLoadTable
  sequence: SequenceSpec
}
