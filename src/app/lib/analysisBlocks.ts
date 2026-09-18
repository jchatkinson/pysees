import type { Model } from '@/app/types/model'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { ArgDef } from '@/app/types/schema'
import type { CommandSchema } from '@/app/lib/commandSchemas'

export interface AnalysisBlockDef {
  id: string
  label: string
  description?: string
  paramsSchema?: ArgDef[]
  /** Called fresh every time (live preview, export) — never cached — so blocks always reflect the current model. */
  build: (params: Record<string, unknown>, model: Model) => AnalysisCommand[]
}

/** Block-produced commands carry their exact positional `ops.fn(...)` call args directly (bypassing schema lookup, which
 * only understands schema-shaped values from CommandForm) so they always render/export exactly as intended. */
type PositionalArg = string | number | boolean

function ops(fn: string, args: PositionalArg[]): AnalysisCommand {
  return { type: 'ANALYSIS_OPS', fn, values: { __args: args } }
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
}

const runGravityAnalysis: AnalysisBlockDef = {
  id: 'run-gravity-analysis',
  label: 'Run Gravity Analysis',
  description: 'Static analysis applying a chosen load pattern in `steps` load-control increments.',
  paramsSchema: [
    { kind: 'int', name: 'steps', label: 'Steps', defaultValue: 10, required: true },
  ],
  build: (params) => {
    const steps = Math.max(1, Math.trunc(Number(params.steps) || 10))
    return [
      ops('constraints', ['Plain']),
      ops('numberer', ['RCM']),
      ops('system', ['BandGeneral']),
      ops('test', ['NormDispIncr', 1e-6, 25]),
      ops('algorithm', ['Newton']),
      ops('integrator', ['LoadControl', 1 / steps]),
      ops('analysis', ['Static']),
      ops('analyze', [steps]),
      ops('loadConst', ['-time', 0.0]),
    ]
  },
}

const runEarthquakeAnalysis: AnalysisBlockDef = {
  id: 'run-earthquake-analysis',
  label: 'Run Earthquake Analysis',
  description: 'Transient (Newmark) analysis stepping through a chosen ground-motion pattern.',
  paramsSchema: [
    { kind: 'float', name: 'dt', label: 'Time Step (dt)', defaultValue: 0.01, required: true },
    { kind: 'int', name: 'nSteps', label: 'Num Steps', defaultValue: 1000, required: true },
  ],
  build: (params) => [
    ops('constraints', ['Plain']),
    ops('numberer', ['RCM']),
    ops('system', ['BandGeneral']),
    ops('test', ['NormDispIncr', 1e-6, 25]),
    ops('algorithm', ['Newton']),
    ops('integrator', ['Newmark', 0.5, 0.25]),
    ops('analysis', ['Transient']),
    ops('analyze', [Math.trunc(Number(params.nSteps) || 1000), Number(params.dt) || 0.01]),
  ],
}

export const ANALYSIS_BLOCKS: AnalysisBlockDef[] = [wholeModelRecorder, runGravityAnalysis, runEarthquakeAnalysis]

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
