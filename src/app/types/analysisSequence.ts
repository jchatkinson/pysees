import type { ModalDampingAnchors } from '@/app/lib/rayleighDamping'
// Target shape for the future pysees -> Carapace compiler (see docs/pysees-carapace-handoff.md).
// Produced from AnalysisBlockDef.toStage()/toRecorders(), never stored in AnalysisHistory directly —
// AnalysisCommand stays the authored/procedural representation used for script export.

export type IntegratorSpec =
  | { kind: 'load-control'; increment: number }
  | { kind: 'displacement-control'; nodeTag: number; dof: 0 | 1 | 2; increment: number }

/** Provisional test-name union — align with carapace-core's actual convergence-test enum once the compiler lands. */
export interface ConvergenceSpec { testType: 'NormDispIncr' | 'NormUnbalance' | 'EnergyIncr'; tol: number; maxIter: number }

/** OpenSees algorithm names, mapped to carapace's `AlgorithmSpec` by the compiler. */
export type AlgorithmKind = 'linear' | 'newton-raphson' | 'modified-newton' | 'krylov-newton' | 'newton-line-search'

export interface TransientSpec {
  integrator: { kind: 'newmark'; gamma: number; beta: number }
  dt: number
  nSteps: number
  patterns?: number[]
  damping?: { alphaM: number; betaK: number; modalAnchors?: ModalDampingAnchors }
  algorithm: AlgorithmKind
  convergence?: ConvergenceSpec
}

export type AnalysisStage =
  | {
      kind: 'static'
      id: string
      steps: number
      integrator: IntegratorSpec
      algorithm: AlgorithmKind
      convergence?: ConvergenceSpec
      /** Load patterns (model pattern tags) this stage ramps. Omitted/empty = every pattern no other stage claims. */
      patterns?: number[]
      /** Freeze this stage's patterns at their final factor afterward (OpenSees `loadConst`). Defaults to true. */
      holdLoads?: boolean
      /** Explicit override of the patterns frozen afterward; normally derived from `patterns`/`holdLoads`. */
      holdPatternsAfter?: number[]
    }
  | { kind: 'modal'; id: string; modes: number }
  /** Reverts the model to its initial state (OpenSees `reset`): zero displacements and history, loads un-frozen. */
  | { kind: 'reset'; id: string }
  | { kind: 'transient'; id: string; config: TransientSpec }

export type RecorderTargetKind = 'node' | 'element'
export type RecorderResponseKind = 'disp' | 'vel' | 'accel' | 'reaction' | 'force'

export interface RecorderSpec {
  id: string
  targetKind: RecorderTargetKind
  targetTags: number[]
  responseKind: RecorderResponseKind
  /** Zero-based DOF components, node recorders only. Omitted for element force recorders. */
  dofs?: number[]
}

export interface AnalysisSequence {
  version: 1
  stages: AnalysisStage[]
  recorders: RecorderSpec[]
}
