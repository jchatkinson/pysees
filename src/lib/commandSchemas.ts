import type { Command } from '@/types/commands'
import type { ModelState } from '@/types/model'
import type { ArgDef, ArgLen, SchemaContext } from '@/types/schema'
import { GENERATED_COMMAND_SCHEMAS } from '@/generated/commandSchemas.generated'
import type { GeneratedArgDef } from '@/generated/commandSchemas.generated'

export interface CommandSchema {
  cmd: string
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

function titleCase(s: string) {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

function vec(name: string, label: string, length: number | 'ndm' | 'ndf', defaultValue: number[]): ArgDef {
  return { kind: 'vec', name, label, length, defaultValue }
}

function int(name: string, label: string, defaultValue: number): ArgDef {
  return { kind: 'int', name, label, defaultValue }
}

function generatedFn(fn: string) {
  return GENERATED_COMMAND_SCHEMAS.find((s) => s.fn === fn)
}

function nodeArgsFromGenerated(): ArgDef[] {
  const generated = generatedFn('node')
  const hasCoordVec = generated?.args.some((a) => a.kind === 'vec' && (a.name.toLowerCase().includes('crd') || a.name.toLowerCase().includes('coord')))
  if (!hasCoordVec) return [vec('coords', 'Coordinates', 'ndm', [0, 0, 0])]
  return [vec('coords', 'Coordinates', 'ndm', [0, 0, 0])]
}

function fixArgsFromGenerated(): ArgDef[] {
  return [{ kind: 'idlist', name: 'nodeId', label: 'Node ID(s)' }, vec('dofs', 'DOF Fix Flags (0/1)', 'ndf', [1, 1, 1, 0, 0, 0])]
}

function loadArgsFromGenerated(): ArgDef[] {
  return [{ kind: 'idlist', name: 'nodeId', label: 'Node ID(s)' }, vec('values', 'Load Values', 'ndf', [0, 0, 0, 0, 0, 0])]
}

function elementArgsFromGenerated(): ArgDef[] {
  const generated = generatedFn('element')
  const choice = generated?.args.find((a) => a.kind === 'choice')
  const optionsRaw = choice?.kind === 'choice' ? choice.options : []
  const options = ['Truss', 'ElasticBeamColumn'].filter((opt) => optionsRaw.includes(opt) || optionsRaw.includes('elasticBeamColumn'))
  return [
    { kind: 'choice', name: 'eleType', label: 'Element Type', options: options.length ? options : ['Truss', 'ElasticBeamColumn'], yields: {}, defaultValue: 'Truss' },
    { kind: 'vec', name: 'nodes', label: 'Node IDs', length: 2, defaultValue: [1, 2], nodeSync: true },
  ]
}

const V1_COMMAND_SCHEMAS: CommandSchema[] = [
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

const RESERVED_FNS = new Set<string>(['node', 'fix', 'load', 'element'])

function mapGeneratedArg(arg: GeneratedArgDef): ArgDef {
  if (arg.kind === 'choice') {
    const yields: Record<string, ArgDef[]> = {}
    for (const [key, value] of Object.entries(arg.yields)) yields[key] = value.map(mapGeneratedArg)
    return { kind: 'choice', name: arg.name, label: titleCase(arg.name), options: arg.options, yields, defaultValue: arg.defaultValue }
  }
  if (arg.kind === 'vec') {
    const length: ArgLen = arg.length === 'dynamic' || arg.length === 'ndm' || arg.length === 'ndf' ? arg.length : Number(arg.length)
    return { kind: 'vec', name: arg.name, label: titleCase(arg.name), length, defaultValue: [] }
  }
  if (arg.kind === 'str') return { kind: arg.kind, name: arg.name, label: titleCase(arg.name), defaultValue: arg.literal ?? '' }
  return { kind: arg.kind, name: arg.name, label: titleCase(arg.name), defaultValue: undefined }
}

const GENERATED_NON_V1_SCHEMAS: CommandSchema[] = GENERATED_COMMAND_SCHEMAS
  .filter((schema) => !RESERVED_FNS.has(schema.fn))
  .map((schema) => ({
    cmd: `OPS:${schema.fn}`,
    fn: schema.fn,
    label: titleCase(schema.label || schema.fn),
    category: schema.category,
    args: schema.args.map(mapGeneratedArg),
    optional: schema.optional.map(mapGeneratedArg),
    create: (values, model, base) => {
      if (schema.fn !== 'uniaxialMaterial') {
        return {
          type: 'ADD_OPS',
          fn: base?.type === 'ADD_OPS' ? base.fn : schema.fn,
          category: schema.category,
          values,
        }
      }
      const rawTag = Number(values.matTag)
      const matTag = Number.isFinite(rawTag) && rawTag > 0 ? Math.trunc(rawTag) : model.nextMatId
      return {
        type: 'ADD_OPS',
        fn: base?.type === 'ADD_OPS' ? base.fn : schema.fn,
        category: schema.category,
        values: { ...values, matTag },
      }
    },
  }))

export function getAvailableSchemas(ndm: number) {
  return [...V1_COMMAND_SCHEMAS, ...GENERATED_NON_V1_SCHEMAS].filter((schema) => !schema.ndmFilter || schema.ndmFilter.includes(ndm))
}

function docsUrlFromRstPath(path: string) {
  const htmlPath = path.replace(/\.rst$/i, '.html').replace(/^\/+/, '')
  return `https://openseespydoc.readthedocs.io/en/latest/${htmlPath}`
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getUniaxialMaterialDocUrl(values?: Record<string, unknown>) {
  const matType = typeof values?.matType === 'string' ? values.matType.trim() : ''
  if (!matType) return docsUrlFromRstPath('src/uniaxialMaterial.rst')

  const generated = GENERATED_COMMAND_SCHEMAS.find((schema) => schema.fn === 'uniaxialMaterial')
  const examplePaths = (generated?.examples ?? []).map(([path]) => path)
  const pathByNormalizedBase = new Map<string, string>()
  for (const path of examplePaths) {
    const base = path.split('/').pop()?.replace(/\.rst$/i, '') ?? ''
    if (!base) continue
    pathByNormalizedBase.set(normalizeToken(base), path)
  }

  const aliases: Record<string, string> = {
    steel01: 'steel01',
    steel01thermal: 'steel01thermal',
    steel02: 'steel02',
    steel4: 'steel4',
    pipe: 'pipeMaterial',
  }

  const normalizedMatType = normalizeToken(matType)
  const aliasBase = aliases[normalizedMatType]
  if (aliasBase) {
    const aliasPath = pathByNormalizedBase.get(normalizeToken(aliasBase))
    if (aliasPath) return docsUrlFromRstPath(aliasPath)
  }
  const directPath = pathByNormalizedBase.get(normalizedMatType)
  if (directPath) return docsUrlFromRstPath(directPath)

  return `https://openseespydoc.readthedocs.io/en/latest/search.html?q=${encodeURIComponent(`uniaxialMaterial ${matType}`)}`
}

export function getCommandDocUrl(fn: string, values?: Record<string, unknown>) {
  if (fn === 'uniaxialMaterial') return getUniaxialMaterialDocUrl(values)
  const generated = GENERATED_COMMAND_SCHEMAS.find((schema) => schema.fn === fn)
  const sourcePath = generated?.examples[0]?.[0]
  if (sourcePath && sourcePath.endsWith('.rst')) {
    return docsUrlFromRstPath(sourcePath)
  }
  return `https://openseespydoc.readthedocs.io/en/latest/search.html?q=${encodeURIComponent(fn)}`
}

export function resolveArgLen(len: ArgLen, ctx: SchemaContext): number | 'dynamic' {
  if (len === 'ndm') return ctx.ndm
  if (len === 'ndf') return ctx.ndf
  if (len === 'dynamic') return 'dynamic'
  return len
}

function defaultsForArg(arg: ArgDef, ctx: SchemaContext, out: Record<string, unknown>) {
  if (arg.kind === 'int' || arg.kind === 'float' || arg.kind === 'str') {
    if (arg.kind === 'str' && arg.name === 'literal') return
    if (arg.defaultValue !== undefined) out[arg.name] = arg.defaultValue
    else if (arg.kind === 'str') out[arg.name] = ''
    return
  }
  if (arg.kind === 'vec') {
    const len = resolveArgLen(arg.length, ctx)
    const seed = arg.defaultValue ?? []
    if (len === 'dynamic') {
      out[arg.name] = [...seed]
      return
    }
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
  if (arg.kind === 'idlist') {
    out[arg.name] = arg.defaultValue ?? []
  }
}

export function initialValues(schema: CommandSchema, ctx: SchemaContext, model?: ModelState) {
  const out: Record<string, unknown> = {}
  for (const arg of schema.args) defaultsForArg(arg, ctx, out)
  for (const arg of schema.optional) defaultsForArg(arg, ctx, out)
  if (schema.fn === 'uniaxialMaterial' && (!Number.isFinite(Number(out.matTag)) || Number(out.matTag) <= 0)) out.matTag = model?.nextMatId ?? 1
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
  const schemas = getAvailableSchemas(ndm)
  if (cmd.type === 'ADD_OPS') return schemas.find((schema) => schema.cmd === `OPS:${cmd.fn}`) ?? null
  if (cmd.type !== 'ADD_NODE' && cmd.type !== 'FIX' && cmd.type !== 'ADD_LOAD' && cmd.type !== 'ADD_ELEMENT') return null
  return schemas.find((schema) => schema.cmd === cmd.type) ?? null
}

export function commandToValues(cmd: Command, ctx: SchemaContext) {
  if (cmd.type === 'ADD_OPS') return { ...cmd.values }
  const base = {
    ADD_NODE: { coords: Array.from({ length: ctx.ndm }, (_, i) => cmd.type === 'ADD_NODE' ? (cmd.coords[i] ?? 0) : 0) },
    FIX: {
      // idlist field expects number[] — wrap single nodeId in array for edit initialisation
      nodeId: cmd.type === 'FIX' ? [cmd.nodeId] : [1],
      dofs: Array.from({ length: ctx.ndf }, (_, i) => cmd.type === 'FIX' ? (cmd.dofs.includes(i + 1) ? 1 : 0) : 0),
    },
    ADD_LOAD: {
      nodeId: cmd.type === 'ADD_LOAD' ? [cmd.nodeId] : [1],
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

function flattenArgValues(arg: ArgDef, values: Record<string, unknown>, ctx: SchemaContext, fallbackMatTag: number): (string | number | boolean | null)[] {
  if (arg.kind === 'int') {
    const rawValue = values[arg.name]
    if ((rawValue === undefined || rawValue === null || rawValue === '') && arg.name !== 'matTag') return []
    const raw = Number(rawValue ?? arg.defaultValue)
    const n = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : (arg.name === 'matTag' ? fallbackMatTag : NaN)
    if (!Number.isFinite(n)) return []
    return [n]
  }
  if (arg.kind === 'float') {
    const rawValue = values[arg.name]
    if (rawValue === undefined || rawValue === null || rawValue === '') return []
    const n = Number(rawValue ?? arg.defaultValue)
    if (!Number.isFinite(n)) return []
    return [n]
  }
  if (arg.kind === 'str') {
    if (arg.name === 'literal') return typeof arg.defaultValue === 'string' ? [arg.defaultValue] : []
    const v = values[arg.name]
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed.length === 0) return []
      const n = Number(trimmed)
      if (Number.isFinite(n)) return [n]
      return [v]
    }
    if (typeof arg.defaultValue === 'string') {
      const trimmed = arg.defaultValue.trim()
      if (trimmed.length === 0) return []
      const n = Number(trimmed)
      if (Number.isFinite(n)) return [n]
      return [arg.defaultValue]
    }
    return []
  }
  if (arg.kind === 'vec') {
    const v = Array.isArray(values[arg.name]) ? values[arg.name] : []
    const len = resolveArgLen(arg.length, ctx)
    if (len === 'dynamic') return v.map((x) => num(x))
    return Array.from({ length: len }, (_, i) => num(v[i]))
  }
  if (arg.kind === 'flag') {
    if (!Boolean(values[arg.flag])) return []
    return [arg.flag, ...arg.args.flatMap((child) => flattenArgValues(child, values, ctx, fallbackMatTag))]
  }
  if (arg.kind === 'choice') {
    const selected = String(values[arg.name] ?? arg.defaultValue ?? arg.options[0] ?? '')
    return [selected, ...(arg.yields[selected] ?? []).flatMap((child) => flattenArgValues(child, values, ctx, fallbackMatTag))]
  }
  return []
}

export function buildUniaxialMaterialCallArgs(values: Record<string, unknown>, ctx: SchemaContext, fallbackMatTag: number) {
  const schema = getAvailableSchemas(ctx.ndm).find((s) => s.cmd === 'OPS:uniaxialMaterial')
  if (!schema) return null
  const choice = schema.args.find((a): a is Extract<ArgDef, { kind: 'choice' }> => a.kind === 'choice' && a.name === 'matType')
  if (!choice) return null
  const matType = String(values.matType ?? choice.defaultValue ?? choice.options[0] ?? '').trim()
  if (!matType) return null
  const yielded = choice.yields[matType] ?? []
  const rest = yielded.flatMap((arg) => flattenArgValues(arg, values, ctx, fallbackMatTag))
  return [matType, ...rest]
}
