// Mirrors carapace/wasm-bridge/src/input_v1/{mod,tables,materials,sequence}.rs's serde
// (camelCase) wire shape exactly. This is what decodeInput() in carapace_wasm expects —
// see src/app/lib/carapace/compileInputV1.ts, the only place that constructs one.

export interface NodeTable { coords: number[]; fixed: number[]; massNodeIndex: number[]; mass: number[] }

export type TransformSpec = 'linear' | 'pDelta' | 'corotational'
export type IntegrationSpec = { kind: 'legendre'; points: number } | { kind: 'lobatto'; points: number }

export interface TrussTable { nodeI: number[]; nodeJ: number[]; area: number[]; material: number[]; density: number[] }
export interface ElasticBeamColumnTable { nodeI: number[]; nodeJ: number[]; e: number[]; a: number[]; iz: number[]; transform: TransformSpec[]; density: number[] }
export interface FiberBeamColumnTable { nodeI: number[]; nodeJ: number[]; fiberSection: number[]; integration: IntegrationSpec[]; corotational: boolean[]; density: number[] }
export interface ZeroLengthTable { nodeI: number[]; nodeJ: number[]; materials: [number, number, number][] }
export interface FiberTable { sectionOffsets: number[]; y: number[]; area: number[]; material: number[] }

export type TimeSeriesSpec = { kind: 'constant' } | { kind: 'linear'; slope: number } | { kind: 'path'; times: number[]; factors: number[] }
export interface LoadPatternTable { series: TimeSeriesSpec[]; scaleFactor: number[] }
export interface NodalLoadTable { pattern: number[]; node: number[]; dof: number[]; value: number[]; stage: number[] }

export type ElementKind = 'truss' | 'elasticBeamColumn' | 'dispBeamColumn' | 'forceBeamColumn' | 'zeroLength'
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
export type StageSpec = {
  kind: 'static'
  id: string
  steps: number
  integrator: IntegratorSpec
  algorithm: AlgorithmSpec
  convergence: ConvergenceSpec | null
  holdPatternsAfter: number[]
}
export interface RecorderSpecWire { node: number; dof: number }
export interface SequenceSpec { stages: StageSpec[]; recorders: RecorderSpecWire[] }

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
  loadPatterns: LoadPatternTable
  nodalLoads: NodalLoadTable
  elementLoads: ElementLoadTable
  sequence: SequenceSpec
}
