import type { CaseModel, PlotSpec, Signal } from './types'

const E = 'core/src/model/elements', M = 'core/src/model/materials'
export const SRC = {
  elastic: `${E}/elastic_beam_column.rs`, disp: `${E}/disp_beam_column.rs`, truss: `${E}/truss.rs`, zeroLength: `${E}/zero_length.rs`, shell4: `${E}/shell4.rs`, shell3: `${E}/shell3.rs`,
  transform: 'core/src/model/transform.rs', fiber: 'core/src/model/fiber_section.rs', integration: 'core/src/model/integration.rs', constraint: 'core/src/model/constraint.rs',
  steel01: `${M}/steel01.rs`, steel02: `${M}/steel02.rs`, concrete01: `${M}/concrete01.rs`, concrete02: `${M}/concrete02.rs`, hysteretic: `${M}/hysteretic.rs`, pinching4: `${M}/pinching4.rs`,
  elasticLike: `${M}/elastic_like.rs`, composite: `${M}/composite.rs`, shellSection: `${M}/shell_section.rs`,
  transient: 'core/src/analysis/transient.rs', modal: 'core/src/analysis/modal.rs', damping: 'core/src/analysis/damping.rs', groundMotion: 'core/src/analysis/ground_motion.rs',
  algorithm: 'core/src/analysis/algorithm.rs', integrator: 'core/src/analysis/integrator.rs', convergence: 'core/src/analysis/convergence.rs', lineSearch: 'core/src/analysis/line_search.rs', krylov: 'core/src/analysis/krylov.rs',
}

export const disp = (node: number, dof: number): Signal => ({ q: 'disp', node, dof })
/** Minus the sum of the support reactions in `dof`: the load the structure carries in that direction (base shear for a lateral dof). */
export const baseShear = ({ model }: CaseModel, dof: number): Signal => ({ sum: [...model.fixes.values()].filter((f) => f.dofs.includes(dof)).map((f) => ({ q: 'reaction' as const, node: f.nodeId, dof })), scale: -1 })
/** The control node and dof of the history's last pushover block. */
export function pushControl({ history }: CaseModel): { node: number; dof: number } {
  const c = [...history.commands].reverse().find((c) => c.type === 'ANALYSIS_BLOCK' && c.blockId === 'run-pushover-analysis')
  const p = c && c.type === 'ANALYSIS_BLOCK' ? c.params : {}
  return { node: Number(p.nodeTag), dof: Number(p.dof) }
}
export const pushoverCurve = (m: CaseModel, title = 'Pushover curve', stages?: number[]): PlotSpec => {
  const { node, dof } = pushControl(m)
  return { title, x: disp(node, dof), y: baseShear(m, dof), xLabel: `Control node ${node} displacement`, yLabel: 'Base reaction', stages, origin: !stages }
}

