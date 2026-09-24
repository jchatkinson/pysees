// Target shape for the future pysees -> Carapace compiler (see docs/pysees-carapace-handoff.md).
// Produced from AnalysisBlockDef.toStage()/toRecorders(), never stored in AnalysisHistory directly —
// AnalysisCommand stays the authored/procedural representation used for script export.

export type IntegratorSpec =
  | { kind: 'load-control'; increment: number }
  | { kind: 'displacement-control'; nodeTag: number; dof: 0 | 1 | 2; increment: number }

/** Provisional test-name union — align with carapace-core's actual convergence-test enum once the compiler lands. */
export interface ConvergenceSpec { testType: 'NormDispIncr' | 'NormUnbalance' | 'EnergyIncr'; tol: number; maxIter: number }

export interface TransientSpec {
  integrator: { kind: 'newmark'; gamma: number; beta: number }
  dt: number
  nSteps: number
  algorithm: 'linear' | 'newton-raphson'
  convergence?: ConvergenceSpec
}

export type AnalysisStage =
  | {
      kind: 'static'
      id: string
      steps: number
      integrator: IntegratorSpec
      algorithm: 'linear' | 'newton-raphson'
      convergence?: ConvergenceSpec
      holdPatternsAfter?: number[]
    }
  | { kind: 'modal'; id: string; modes: number }
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
