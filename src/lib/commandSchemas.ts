import type { Command } from '@/types/commands'
import type { ModelState } from '@/types/model'
import type { ArgDef, SchemaContext } from '@/types/schema'
import { GENERATED_COMMAND_SCHEMAS } from '@/generated/commandSchemas.generated'

type V1CommandType = Extract<Command['type'], 'ADD_NODE' | 'FIX' | 'ADD_LOAD' | 'ADD_ELEMENT'>

export interface CommandSchema {
  cmd: V1CommandType
  fn: string
  label: string
  category: 'model' | 'recorder'
  ndmFilter?: number[]
  args: ArgDef[]
  optional: ArgDef[]
  create: (values: Record<string, unknown>, model: ModelState, base?: Command) => Command
}

function num(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function nums(v: unknown) {
  return Array.isArray(v) ? v.map((x) => num(x)) : []
}

function ints(v: unknown) {
  return nums(v).map((x) => Math.trunc(x))
}

function generatedFn(fn: string) {
  return GENERATED_COMMAND_SCHEMAS.find((s) => s.fn === fn)
}

function vec(name: string, label: string, length: number | 'ndm' | 'ndf', defaultValue: number[]): ArgDef {
  return { kind: 'vec', name, label, length, defaultValue }
}

function int(name: string, label: string, defaultValue: number): ArgDef {
  return { kind: 'int', name, label, defaultValue }
}

function nodeArgsFromGenerated(): ArgDef[] {
  const generated = generatedFn('node')
  const hasCoordVec = generated?.args.some((a) => a.kind === 'vec' && (a.name.toLowerCase().includes('crd') || a.name.toLowerCase().includes('coord')))
  if (!hasCoordVec) return [vec('coords', 'Coordinates', 'ndm', [0, 0, 0])]
  return [vec('coords', 'Coordinates', 'ndm', [0, 0, 0])]
}

function fixArgsFromGenerated(): ArgDef[] {
  const generated = generatedFn('fix')
  const hasNodeTag = generated?.args.some((a) => a.kind === 'int' && a.name.toLowerCase().includes('node'))
  const hasConstr = generated?.args.some((a) => a.kind === 'vec' && a.name.toLowerCase().includes('constr'))
  if (!hasNodeTag || !hasConstr) {
    return [int('nodeId', 'Node ID', 1), vec('dofs', 'DOF Fix Flags (0/1)', 'ndf', [1, 1, 1, 0, 0, 0])]
  }
  return [int('nodeId', 'Node ID', 1), vec('dofs', 'DOF Fix Flags (0/1)', 'ndf', [1, 1, 1, 0, 0, 0])]
}

function loadArgsFromGenerated(): ArgDef[] {
  const generated = generatedFn('load')
  const hasNodeTag = generated?.args.some((a) => a.kind === 'int' && a.name.toLowerCase().includes('node'))
  const hasValues = generated?.args.some((a) => a.kind === 'vec' && a.name.toLowerCase().includes('load'))
  if (!hasNodeTag || !hasValues) {
    return [int('nodeId', 'Node ID', 1), vec('values', 'Load Values', 'ndf', [0, 0, 0, 0, 0, 0])]
  }
  return [int('nodeId', 'Node ID', 1), vec('values', 'Load Values', 'ndf', [0, 0, 0, 0, 0, 0])]
}

function elementArgsFromGenerated(): ArgDef[] {
  const generated = generatedFn('element')
  const choice = generated?.args.find((a) => a.kind === 'choice')
  const optionsRaw = choice?.kind === 'choice' ? choice.options : []
  const options = ['Truss', 'ElasticBeamColumn'].filter((opt) => optionsRaw.includes(opt) || optionsRaw.includes('elasticBeamColumn'))
  return [
    { kind: 'choice', name: 'eleType', label: 'Element Type', options: options.length ? options : ['Truss', 'ElasticBeamColumn'], yields: {}, defaultValue: 'Truss' },
    vec('nodes', 'Node IDs', 2, [1, 2]),
  ]
}

export const V1_COMMAND_SCHEMAS: CommandSchema[] = [
  {
    cmd: 'ADD_NODE',
    fn: 'node',
    label: 'Node',
    category: 'model',
    args: nodeArgsFromGenerated(),
    optional: [],
    create: (values, model, base) => ({
      type: 'ADD_NODE',
      id: base?.type === 'ADD_NODE' ? base.id : model.nextNodeId,
      coords: nums(values.coords),
    }),
  },
  {
    cmd: 'FIX',
    fn: 'fix',
    label: 'Fix Node',
    category: 'model',
    args: fixArgsFromGenerated(),
    optional: [],
    create: (values) => {
      const flags = ints(values.dofs)
      const dofs = flags.map((flag, idx) => (flag ? idx + 1 : 0)).filter(Boolean)
      return { type: 'FIX', nodeId: Math.trunc(num(values.nodeId, 1)), dofs }
    },
  },
  {
    cmd: 'ADD_LOAD',
    fn: 'load',
    label: 'Nodal Load',
    category: 'model',
    args: loadArgsFromGenerated(),
    optional: [],
    create: (values) => ({ type: 'ADD_LOAD', nodeId: Math.trunc(num(values.nodeId, 1)), values: nums(values.values) }),
  },
  {
    cmd: 'ADD_ELEMENT',
    fn: 'element',
    label: 'Element',
    category: 'model',
    args: elementArgsFromGenerated(),
    optional: [],
    create: (values, model, base) => ({
      type: 'ADD_ELEMENT',
      id: base?.type === 'ADD_ELEMENT' ? base.id : model.nextEleId,
      eleType: String(values.eleType ?? 'Truss'),
      nodes: ints(values.nodes),
    }),
  },
]

export function getAvailableSchemas(ndm: number) {
  return V1_COMMAND_SCHEMAS.filter((schema) => !schema.ndmFilter || schema.ndmFilter.includes(ndm))
}

export function resolveArgLen(len: number | 'ndm' | 'ndf', ctx: SchemaContext) {
  if (len === 'ndm') return ctx.ndm
  if (len === 'ndf') return ctx.ndf
  return len
}

function defaultsForArg(arg: ArgDef, ctx: SchemaContext, out: Record<string, unknown>) {
  if (arg.kind === 'int' || arg.kind === 'float' || arg.kind === 'str') {
    out[arg.name] = arg.defaultValue ?? (arg.kind === 'str' ? '' : 0)
    return
  }
  if (arg.kind === 'vec') {
    const len = resolveArgLen(arg.length, ctx)
    const seed = arg.defaultValue ?? []
    out[arg.name] = Array.from({ length: len }, (_, idx) => seed[idx] ?? 0)
    return
  }
  if (arg.kind === 'flag') {
    out[arg.flag] = arg.defaultValue ?? false
    for (const child of arg.args) defaultsForArg(child, ctx, out)
    return
  }
  if (arg.kind === 'choice') {
    out[arg.name] = arg.defaultValue ?? arg.options[0] ?? ''
    for (const child of arg.yields[String(out[arg.name])] ?? []) defaultsForArg(child, ctx, out)
  }
}

export function initialValues(schema: CommandSchema, ctx: SchemaContext) {
  const out: Record<string, unknown> = {}
  for (const arg of schema.args) defaultsForArg(arg, ctx, out)
  for (const arg of schema.optional) defaultsForArg(arg, ctx, out)
  return out
}

export function validateCommand(cmd: Command, model: ModelState) {
  if (cmd.type === 'FIX' || cmd.type === 'ADD_LOAD') {
    if (!model.nodes.has(cmd.nodeId)) return `Node ${cmd.nodeId} does not exist.`
  }
  if (cmd.type === 'ADD_ELEMENT') {
    if (cmd.nodes.length < 2) return 'Element requires at least 2 node IDs.'
    if (cmd.nodes.some((id) => !model.nodes.has(id))) return 'Element references one or more missing nodes.'
  }
  if (cmd.type === 'FIX' && cmd.dofs.length === 0) return 'Select at least one constrained DOF.'
  return null
}

export function getSchemaForCommand(cmd: Command, ndm: number) {
  if (cmd.type !== 'ADD_NODE' && cmd.type !== 'FIX' && cmd.type !== 'ADD_LOAD' && cmd.type !== 'ADD_ELEMENT') return null
  return getAvailableSchemas(ndm).find((schema) => schema.cmd === cmd.type) ?? null
}

export function commandToValues(cmd: Command, ctx: SchemaContext) {
  const base = {
    ADD_NODE: { coords: Array.from({ length: ctx.ndm }, (_, i) => cmd.type === 'ADD_NODE' ? (cmd.coords[i] ?? 0) : 0) },
    FIX: {
      nodeId: cmd.type === 'FIX' ? cmd.nodeId : 1,
      dofs: Array.from({ length: ctx.ndf }, (_, i) => cmd.type === 'FIX' ? (cmd.dofs.includes(i + 1) ? 1 : 0) : 0),
    },
    ADD_LOAD: {
      nodeId: cmd.type === 'ADD_LOAD' ? cmd.nodeId : 1,
      values: Array.from({ length: ctx.ndf }, (_, i) => cmd.type === 'ADD_LOAD' ? (cmd.values[i] ?? 0) : 0),
    },
    ADD_ELEMENT: {
      eleType: cmd.type === 'ADD_ELEMENT' ? cmd.eleType : 'Truss',
      nodes: cmd.type === 'ADD_ELEMENT' ? [...cmd.nodes] : [1, 2],
    },
  }
  if (cmd.type === 'ADD_NODE') return base.ADD_NODE
  if (cmd.type === 'FIX') return base.FIX
  if (cmd.type === 'ADD_LOAD') return base.ADD_LOAD
  if (cmd.type === 'ADD_ELEMENT') return base.ADD_ELEMENT
  return {}
}
