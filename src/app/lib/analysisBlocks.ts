import type { Model } from '@/app/types/model'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { ArgDef } from '@/app/types/schema'
import type { CommandSchema } from '@/app/lib/commandSchemas'
import type { AnalysisStage, ConvergenceSpec, RecorderSpec } from '@/app/types/analysisSequence'

export interface AnalysisBlockDef {
  id: string
  label: string
  description?: string
  paramsSchema?: ArgDef[]
  /** Called fresh every time (live preview, export) — never cached — so blocks always reflect the current model. */
  build: (params: Record<string, unknown>, model: Model) => AnalysisCommand[]
  /** Structured counterpart of build(), for the future Carapace compiler. Absent for blocks with no Carapace equivalent (e.g. arbitrary/export-only presets). */
  toStage?: (params: Record<string, unknown>, model: Model) => AnalysisStage
  /** Structured counterpart of build() for recorder blocks. */
  toRecorders?: (params: Record<string, unknown>, model: Model) => RecorderSpec[]
}

/** Block-produced commands carry their exact positional `ops.fn(...)` call args directly (bypassing schema lookup, which
 * only understands schema-shaped values from CommandForm) so they always render/export exactly as intended. */
type PositionalArg = string | number | boolean

function ops(fn: string, args: PositionalArg[]): AnalysisCommand {
  return { type: 'ANALYSIS_OPS', fn, values: { __args: args } }
}

/** Shared "analysis settings" fields (algorithm + convergence test) every solver stage block exposes. */
const CONVERGENCE_SCHEMA: ArgDef[] = [
  { kind: 'choice', name: 'algorithm', label: 'Algorithm', options: ['Newton', 'Linear'], yields: { Newton: [], Linear: [] }, defaultValue: 'Newton' },
  { kind: 'choice', name: 'testType', label: 'Convergence Test', options: ['NormDispIncr', 'NormUnbalance', 'EnergyIncr'], yields: { NormDispIncr: [], NormUnbalance: [], EnergyIncr: [] }, defaultValue: 'NormDispIncr' },
  { kind: 'float', name: 'tol', label: 'Tolerance', defaultValue: 1e-6 },
  { kind: 'int', name: 'maxIter', label: 'Max Iterations', defaultValue: 25 },
]

function convergenceOps(params: Record<string, unknown>): AnalysisCommand[] {
  const testType = String(params.testType ?? 'NormDispIncr')
  const tol = Number(params.tol) || 1e-6
  const maxIter = Math.trunc(Number(params.maxIter) || 25)
  const algorithm = String(params.algorithm ?? 'Newton')
  return [ops('test', [testType, tol, maxIter]), ops('algorithm', [algorithm])]
}

function convergenceStage(params: Record<string, unknown>): { algorithm: 'linear' | 'newton-raphson'; convergence: ConvergenceSpec } {
  return {
    algorithm: String(params.algorithm ?? 'Newton') === 'Linear' ? 'linear' : 'newton-raphson',
    convergence: {
      testType: String(params.testType ?? 'NormDispIncr') as ConvergenceSpec['testType'],
      tol: Number(params.tol) || 1e-6,
      maxIter: Math.trunc(Number(params.maxIter) || 25),
    },
  }
}

const wholeModelRecorder: AnalysisBlockDef = {
  id: 'whole-model-recorder',
  label: 'Whole Model Recorder',
  description: 'Node displacement/velocity/acceleration, support reactions, and element forces for every node/element currently in the model.',
  paramsSchema: [{ kind: 'str', name: 'directory', label: 'Output Directory', defaultValue: 'out' }],
  build: (params, model) => {
    const dir = String(params.directory ?? 'out').replace(/\/$/, '')
    const nodeTags = [...model.nodes.keys()].sort((a, b) => a - b)
    const eleTags = [...model.elements.keys()].sort((a, b) => a - b)
    const commands: AnalysisCommand[] = []
    if (nodeTags.length) {
      commands.push(ops('recorder', ['Node', '-file', `${dir}/disp.out`, '-time', '-node', ...nodeTags, '-dof', 1, 2, 3, 'disp']))
      commands.push(ops('recorder', ['Node', '-file', `${dir}/vel.out`, '-time', '-node', ...nodeTags, '-dof', 1, 2, 3, 'vel']))
      commands.push(ops('recorder', ['Node', '-file', `${dir}/accel.out`, '-time', '-node', ...nodeTags, '-dof', 1, 2, 3, 'accel']))
      commands.push(ops('recorder', ['Node', '-file', `${dir}/reaction.out`, '-time', '-node', ...nodeTags, '-dof', 1, 2, 3, 'reaction']))
    }
    if (eleTags.length) {
      commands.push(ops('recorder', ['Element', '-file', `${dir}/eleForce.out`, '-time', '-ele', ...eleTags, 'force']))
    }
    return commands
  },
  toRecorders: (_params, model) => {
    const nodeTags = [...model.nodes.keys()].sort((a, b) => a - b)
    const eleTags = [...model.elements.keys()].sort((a, b) => a - b)
    const ndf = model.config?.ndf ?? 3
    const dofs = Array.from({ length: ndf }, (_, i) => i)
    const recorders: RecorderSpec[] = []
    if (nodeTags.length) {
      recorders.push({ id: 'disp', targetKind: 'node', targetTags: nodeTags, responseKind: 'disp', dofs })
      recorders.push({ id: 'vel', targetKind: 'node', targetTags: nodeTags, responseKind: 'vel', dofs })
      recorders.push({ id: 'accel', targetKind: 'node', targetTags: nodeTags, responseKind: 'accel', dofs })
      recorders.push({ id: 'reaction', targetKind: 'node', targetTags: nodeTags, responseKind: 'reaction', dofs })
    }
    if (eleTags.length) {
      recorders.push({ id: 'eleForce', targetKind: 'element', targetTags: eleTags, responseKind: 'force' })
    }
    return recorders
  },
}

const runGravityAnalysis: AnalysisBlockDef = {
  id: 'run-gravity-analysis',
  label: 'Run Gravity Analysis',
  description: 'Static analysis applying a chosen load pattern in `steps` load-control increments.',
  paramsSchema: [
    { kind: 'int', name: 'steps', label: 'Steps', defaultValue: 10, required: true },
    ...CONVERGENCE_SCHEMA,
  ],
  build: (params) => {
    const steps = Math.max(1, Math.trunc(Number(params.steps) || 10))
    return [
      ops('constraints', ['Plain']),
      ops('numberer', ['RCM']),
      ops('system', ['BandGeneral']),
      ...convergenceOps(params),
      ops('integrator', ['LoadControl', 1 / steps]),
      ops('analysis', ['Static']),
      ops('analyze', [steps]),
      ops('loadConst', ['-time', 0.0]),
    ]
  },
  toStage: (params, model) => ({
    kind: 'static',
    id: 'gravity',
    steps: Math.max(1, Math.trunc(Number(params.steps) || 10)),
    integrator: { kind: 'load-control', increment: 1 / Math.max(1, Math.trunc(Number(params.steps) || 10)) },
    ...convergenceStage(params),
    holdPatternsAfter: [...model.patterns.keys()],
  }),
}

const runPushoverAnalysis: AnalysisBlockDef = {
  id: 'run-pushover-analysis',
  label: 'Run Pushover Analysis',
  description: 'Static analysis in `steps` displacement-control increments at a chosen node/DOF.',
  paramsSchema: [
    { kind: 'int', name: 'nodeTag', label: 'Control Node', required: true },
    { kind: 'int', name: 'dof', label: 'DOF (1-based)', defaultValue: 1, required: true },
    { kind: 'float', name: 'increment', label: 'Displacement Increment', defaultValue: 0.01, required: true },
    { kind: 'int', name: 'steps', label: 'Steps', defaultValue: 100, required: true },
    ...CONVERGENCE_SCHEMA,
  ],
  build: (params) => {
    const nodeTag = Math.trunc(Number(params.nodeTag) || 0)
    const dof = Math.trunc(Number(params.dof) || 1)
    const increment = Number(params.increment) || 0.01
    const steps = Math.max(1, Math.trunc(Number(params.steps) || 100))
    return [
      ops('constraints', ['Plain']),
      ops('numberer', ['RCM']),
      ops('system', ['BandGeneral']),
      ...convergenceOps(params),
      ops('integrator', ['DisplacementControl', nodeTag, dof, increment]),
      ops('analysis', ['Static']),
      ops('analyze', [steps]),
    ]
  },
  toStage: (params) => {
    const dof1Based = Math.trunc(Number(params.dof) || 1)
    return {
      kind: 'static',
      id: 'pushover',
      steps: Math.max(1, Math.trunc(Number(params.steps) || 100)),
      integrator: {
        kind: 'displacement-control',
        nodeTag: Math.trunc(Number(params.nodeTag) || 0),
        dof: Math.min(2, Math.max(0, dof1Based - 1)) as 0 | 1 | 2,
        increment: Number(params.increment) || 0.01,
      },
      ...convergenceStage(params),
    }
  },
}

const runEarthquakeAnalysis: AnalysisBlockDef = {
  id: 'run-earthquake-analysis',
  label: 'Run Earthquake Analysis',
  description: 'Transient (Newmark) analysis stepping through a chosen ground-motion pattern.',
  paramsSchema: [
    { kind: 'float', name: 'dt', label: 'Time Step (dt)', defaultValue: 0.01, required: true },
    { kind: 'int', name: 'nSteps', label: 'Num Steps', defaultValue: 1000, required: true },
    ...CONVERGENCE_SCHEMA,
  ],
  build: (params) => [
    ops('constraints', ['Plain']),
    ops('numberer', ['RCM']),
    ops('system', ['BandGeneral']),
    ...convergenceOps(params),
    ops('integrator', ['Newmark', 0.5, 0.25]),
    ops('analysis', ['Transient']),
    ops('analyze', [Math.trunc(Number(params.nSteps) || 1000), Number(params.dt) || 0.01]),
  ],
  toStage: (params) => ({
    kind: 'transient',
    id: 'earthquake',
    config: {
      integrator: { kind: 'newmark', gamma: 0.5, beta: 0.25 },
      dt: Number(params.dt) || 0.01,
      nSteps: Math.trunc(Number(params.nSteps) || 1000),
      ...convergenceStage(params),
    },
  }),
}

export const ANALYSIS_BLOCKS: AnalysisBlockDef[] = [wholeModelRecorder, runGravityAnalysis, runPushoverAnalysis, runEarthquakeAnalysis]

export function getAnalysisBlock(id: string): AnalysisBlockDef | null {
  return ANALYSIS_BLOCKS.find((b) => b.id === id) ?? null
}

/** Presents an AnalysisBlockDef as a CommandSchema so it can flow through the same add/edit form machinery as any other command. */
export function blockAsSchema(block: AnalysisBlockDef): CommandSchema {
  return {
    cmd: `BLOCK:${block.id}`,
    fn: block.id,
    label: block.label,
    domain: 'analysis',
    description: block.description,
    args: block.paramsSchema ?? [],
    optional: [],
    create: (values) => ({ target: 'analysis', command: { type: 'ANALYSIS_BLOCK', blockId: block.id, params: values } }),
  }
}

/** Resolves an ANALYSIS_BLOCK command (or passes through anything else) into concrete commands — used by the exporter and live preview. */
export function resolveAnalysisCommand(cmd: AnalysisCommand, model: Model): AnalysisCommand[] {
  if (cmd.type === 'ANALYSIS_BLOCK') {
    const block = getAnalysisBlock(cmd.blockId)
    if (!block) return []
    return block.build(cmd.params, model)
  }
  if (cmd.type === 'SCRIPT_GROUP') {
    return cmd.commands.flatMap((c) => resolveAnalysisCommand(c, model))
  }
  return [cmd]
}
