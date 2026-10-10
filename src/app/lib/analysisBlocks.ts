import type { Model } from '@/app/types/model'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { ArgDef } from '@/app/types/schema'
import type { CommandSchema } from '@/app/lib/commandSchemas'
import type { AlgorithmKind, AnalysisStage, ConvergenceSpec, RecorderSpec } from '@/app/types/analysisSequence'
import { isShell } from '@/app/lib/commands/tables'

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

const ALGORITHM_OPTIONS = ['Newton', 'ModifiedNewton', 'KrylovNewton', 'NewtonLineSearch', 'Linear']
const ALGORITHM_KINDS: Record<string, AlgorithmKind> = {
  Newton: 'newton-raphson', ModifiedNewton: 'modified-newton', KrylovNewton: 'krylov-newton', NewtonLineSearch: 'newton-line-search', Linear: 'linear',
}

/** Shared "analysis settings" fields (algorithm + convergence test) every solver stage block exposes. */
const CONVERGENCE_SCHEMA: ArgDef[] = [
  { kind: 'choice', name: 'algorithm', label: 'Algorithm', options: ALGORITHM_OPTIONS, yields: Object.fromEntries(ALGORITHM_OPTIONS.map((o) => [o, []])), defaultValue: 'Newton' },
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

function convergenceStage(params: Record<string, unknown>): { algorithm: AlgorithmKind; convergence: ConvergenceSpec } {
  return {
    algorithm: ALGORITHM_KINDS[String(params.algorithm ?? 'Newton')] ?? 'newton-raphson',
    convergence: {
      testType: String(params.testType ?? 'NormDispIncr') as ConvergenceSpec['testType'],
      tol: Number(params.tol) || 1e-6,
      maxIter: Math.trunc(Number(params.maxIter) || 25),
    },
  }
}

const PATTERNS_FIELD: ArgDef = {
  kind: 'idlist', name: 'patterns', label: 'Load Patterns', defaultValue: [],
  description: 'Pattern tags this stage ramps. Leave empty to apply every pattern no other analysis stage claims.',
}

export function blockPatternTags(params: Record<string, unknown>): number[] {
  // `holdPatterns` is the pre-`patterns` spelling, kept so already-saved histories still resolve.
  const raw = Array.isArray(params.patterns) && params.patterns.length ? params.patterns : params.holdPatterns
  return Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isFinite(n)) : []
}

/**
 * Which OpenSees element response matches the force PySees (and Carapace) report. OpenSees `force` is in global axes for every
 * element, but beams are reported in local axes (N, V, M at each end), which is `localForce`. Trusses and zero-length elements
 * are reported in global axes, so they use `force`. Verified against OpenSees in carapaceVsOpenSees.test.ts.
 */
const LOCAL_FORCE_ELEMENTS = new Set(['ElasticBeamColumn', 'DispBeamColumn'])

/** The element-force recorders a model needs: one OpenSees response per file, since a recorder takes a single response type. */
export function elementForceRecorders(model: Model): { response: 'force' | 'localForce' | 'stresses'; file: string; eleTags: number[] }[] {
  const tags = (local: boolean) => [...model.elements.values()].filter((e) => LOCAL_FORCE_ELEMENTS.has(e.eleType) === local).map((e) => e.id).sort((a, b) => a - b)
  // A shell's stress resultants at its Gauss points: the contour view's data, and what the `shell` results columns hold.
  const shells = [...model.elements.values()].filter((e) => isShell(e.eleType)).map((e) => e.id).sort((a, b) => a - b)
  return [
    { response: 'localForce' as const, file: 'eleLocalForce.out', eleTags: tags(true) },
    { response: 'force' as const, file: 'eleForce.out', eleTags: tags(false) },
    { response: 'stresses' as const, file: 'eleShellStress.out', eleTags: shells },
  ].filter((g) => g.eleTags.length > 0)
}

const wholeModelRecorder: AnalysisBlockDef = {
  id: 'whole-model-recorder',
  label: 'Whole Model Recorder',
  description: 'Node displacement, support reactions, and element forces for every node/element currently in the model.',
  paramsSchema: [{ kind: 'str', name: 'directory', label: 'Output Directory', defaultValue: 'out' }],
  build: (params, model) => {
    const dir = String(params.directory ?? 'out').replace(/\/$/, '')
    const nodeTags = [...model.nodes.keys()].sort((a, b) => a - b)
    const dofs = Array.from({ length: model.config?.ndf ?? 3 }, (_, i) => i + 1)
    const commands: AnalysisCommand[] = []
    if (nodeTags.length) {
      commands.push(ops('recorder', ['Node', '-file', `${dir}/disp.out`, '-time', '-node', ...nodeTags, '-dof', ...dofs, 'disp']))
      commands.push(ops('recorder', ['Node', '-file', `${dir}/reaction.out`, '-time', '-node', ...nodeTags, '-dof', ...dofs, 'reaction']))
    }
    for (const g of elementForceRecorders(model)) commands.push(ops('recorder', ['Element', '-file', `${dir}/${g.file}`, '-time', '-ele', ...g.eleTags, g.response]))
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
      recorders.push({ id: 'reaction', targetKind: 'node', targetTags: nodeTags, responseKind: 'reaction', dofs })
    }
    if (eleTags.length) {
      recorders.push({ id: 'eleForce', targetKind: 'element', targetTags: eleTags, responseKind: 'force' })
    }
    return recorders
  },
}

const runGravityAnalysis: AnalysisBlockDef = {
  // id kept as 'run-gravity-analysis' so saved histories keep resolving; it is a general static load stage.
  id: 'run-gravity-analysis',
  label: 'Run Static Load Analysis',
  description: 'Static analysis ramping the chosen load patterns in `steps` load-control increments (gravity, or any other load case).',
  paramsSchema: [
    PATTERNS_FIELD,
    { kind: 'int', name: 'steps', label: 'Steps', defaultValue: 10, required: true },
    { kind: 'choice', name: 'holdLoads', label: 'Hold Loads Afterward', options: ['Yes', 'No'], yields: { Yes: [], No: [] }, defaultValue: 'Yes', description: 'Freeze these loads at full value for later stages (loadConst).' },
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
      ...(params.holdLoads === 'No' ? [] : [ops('loadConst', ['-time', 0.0])]),
    ]
  },
  toStage: (params) => {
    const steps = Math.max(1, Math.trunc(Number(params.steps) || 10))
    return {
      kind: 'static',
      id: 'static-load',
      steps,
      integrator: { kind: 'load-control', increment: 1 / steps },
      ...convergenceStage(params),
      patterns: blockPatternTags(params),
      holdLoads: params.holdLoads !== 'No',
    }
  },
}

const runPushoverAnalysis: AnalysisBlockDef = {
  id: 'run-pushover-analysis',
  label: 'Run Pushover Analysis',
  description: 'Static analysis in `steps` displacement-control increments at a chosen node/DOF.',
  paramsSchema: [
    { ...PATTERNS_FIELD, label: 'Reference Load Patterns', description: 'Pattern tags whose loads define the load direction displacement control drives against. Leave empty to use every pattern with a load on the control node/DOF.' },
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
      patterns: blockPatternTags(params),
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

const runEigenAnalysis: AnalysisBlockDef = {
  id: 'run-eigen-analysis',
  label: 'Run Eigen Analysis',
  description: 'Eigenvalue (modal) analysis of the current model state: natural frequencies and mode shapes for the lowest `modes` modes.',
  paramsSchema: [{ kind: 'int', name: 'modes', label: 'Number of Modes', defaultValue: 3, required: true }],
  build: (params) => [
    ops('constraints', ['Plain']),
    ops('numberer', ['RCM']),
    ops('system', ['BandGeneral']),
    ops('eigen', [Math.max(1, Math.trunc(Number(params.modes) || 3))]),
  ],
  toStage: (params) => ({ kind: 'modal', id: 'eigen', modes: Math.max(1, Math.trunc(Number(params.modes) || 3)) }),
}

const resetModel: AnalysisBlockDef = {
  id: 'reset-model',
  label: 'Reset Model',
  description: 'Reverts the model to its initial state (OpenSees reset): displacements, velocities and material history return to their starting values and time returns to 0. As in OpenSees, loads frozen by an earlier analysis (loadConst) stay applied at their frozen value, so they are in full from the next analysis\'s first step; loads that were not frozen ramp again. Use it to start the next analysis from an undeformed state instead of continuing from the last one.',
  build: () => [ops('reset', [])],
  toStage: () => ({ kind: 'reset', id: 'reset' }),
}

const wipeAnalysis: AnalysisBlockDef = {
  id: 'wipe-analysis',
  label: 'Wipe Analysis',
  description: 'Removes the analysis objects (OpenSees wipeAnalysis) while keeping the model state, so the next analysis continues from where the last one ended. Carapace creates fresh analysis objects for every stage anyway, so this only affects the exported script.',
  build: () => [ops('wipeAnalysis', [])],
}

export const ANALYSIS_BLOCKS: AnalysisBlockDef[] = [wholeModelRecorder, runGravityAnalysis, runPushoverAnalysis, runEarthquakeAnalysis, runEigenAnalysis, resetModel, wipeAnalysis]

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
