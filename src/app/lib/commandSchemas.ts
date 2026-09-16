import type { Command } from '@/app/types/commands'
import type { ModelState } from '@/app/types/model'
import type { ArgDef, ArgLen, SchemaContext } from '@/app/types/schema'
import { GENERATED_COMMAND_SCHEMAS } from '@/app/generated/commandSchemas.generated'
import type { GeneratedArgDef } from '@/app/generated/commandSchemas.generated'

export interface CommandSchema {
  cmd: string
  fn: string
  label: string
  category: 'model' | 'recorder'
  /** Very short, one-line description shown next to the command in search results. */
  description?: string
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

function genericArgToken(arg: ArgDef): string {
  if (arg.kind === 'flag') return `[${arg.flag}]`
  return arg.name
}

/**
 * A schema-shape signature like `beamIntegration(type, *args)` rather than one
 * concrete overload's literal args — used as the search-result subtitle since a
 * single overload (e.g. the 'CompositeSimpson' args) would be misleading for a
 * command whose args vary by the chosen type/`choice` arg.
 */
function genericSignature(fn: string, args: ArgDef[], optional: ArgDef[]): string {
  const parts: string[] = []
  let branched = false
  for (const arg of args) {
    parts.push(genericArgToken(arg))
    if (arg.kind === 'choice' && Object.values(arg.yields).some((sub) => sub.length > 0)) {
      branched = true
      break
    }
  }
  if (branched) {
    parts.push('*args')
  } else {
    for (const arg of optional) parts.push(`[${genericArgToken(arg)}]`)
  }
  return `${fn}(${parts.join(', ')})`
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
    description: 'Add a node at given coordinates',
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
    description: "Restrain a node's degrees of freedom",
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
    description: 'Apply a load to a node',
    args: loadArgsFromGenerated(),
    optional: [],
    create: (values) => ({ type: 'ADD_LOAD', nodeId: Math.trunc(num(values.nodeId, 1)), values: nums(values.values) }),
  },
  {
    cmd: 'ADD_ELEMENT',
    fn: 'element',
    label: 'Element',
    category: 'model',
    description: 'Add an element connecting nodes',
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
    return { kind: 'choice', name: arg.name, label: titleCase(arg.name), options: arg.options, yields, defaultValue: arg.defaultValue, description: arg.description, required: arg.required, defaultSource: arg.defaultSource }
  }
  if (arg.kind === 'vec') {
    const length: ArgLen = arg.length === 'dynamic' || arg.length === 'ndm' || arg.length === 'ndf' ? arg.length : Number(arg.length)
    return { kind: 'vec', name: arg.name, label: titleCase(arg.name), length, defaultValue: arg.defaultValue ?? [], description: arg.description, required: arg.required, defaultSource: arg.defaultSource }
  }
  if (arg.kind === 'str') {
    const strDefault = arg.literal ?? (typeof arg.defaultValue === 'string' || typeof arg.defaultValue === 'number' ? arg.defaultValue : '')
    return { kind: arg.kind, name: arg.name, label: titleCase(arg.name), defaultValue: strDefault, description: arg.description, required: arg.required, defaultSource: arg.defaultSource }
  }
  return { kind: arg.kind, name: arg.name, label: titleCase(arg.name), defaultValue: typeof arg.defaultValue === 'number' ? arg.defaultValue : undefined, description: arg.description, required: arg.required, defaultSource: arg.defaultSource }
}

const GENERATED_NON_V1_SCHEMAS: CommandSchema[] = GENERATED_COMMAND_SCHEMAS
  .filter((schema) => !RESERVED_FNS.has(schema.fn))
  .map((schema) => {
    const args = schema.args.map(mapGeneratedArg)
    const optional = schema.optional.map(mapGeneratedArg)
    return {
      cmd: `OPS:${schema.fn}`,
      fn: schema.fn,
      label: titleCase(schema.label || schema.fn),
      category: schema.category,
      description: genericSignature(schema.fn, args, optional),
      args,
      optional,
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
    }
  })

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

function hasRequiredArgValue(arg: ArgDef, values: Record<string, unknown>, ctx: SchemaContext): boolean {
  if (!arg.required) return true
  if (arg.kind === 'int' || arg.kind === 'float') {
    const value = values[arg.name]
    if (value === undefined || value === null || value === '') return false
    return Number.isFinite(Number(value))
  }
  if (arg.kind === 'str') {
    if (arg.name === 'literal') return true
    const value = values[arg.name]
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null
  }
  if (arg.kind === 'vec') {
    const value = values[arg.name]
    if (!Array.isArray(value)) return false
    const len = resolveArgLen(arg.length, ctx)
    if (len === 'dynamic') return value.length > 0 && value.every((item) => Number.isFinite(Number(item)))
    if (value.length < len) return false
    return Array.from({ length: len }, (_, i) => Number.isFinite(Number(value[i]))).every(Boolean)
  }
  if (arg.kind === 'idlist') {
    const value = values[arg.name]
    return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isFinite(Number(item)) && Number(item) > 0)
  }
  if (arg.kind === 'flag') {
    return Boolean(values[arg.flag])
  }
  if (arg.kind === 'choice') {
    const selected = String(values[arg.name] ?? arg.defaultValue ?? '')
    return selected.trim().length > 0
  }
  return true
}

function validateRequiredArgs(args: ArgDef[], values: Record<string, unknown>, ctx: SchemaContext): string | null {
  for (const arg of args) {
    if (!hasRequiredArgValue(arg, values, ctx)) {
      const name = arg.kind === 'flag' ? arg.flag : arg.name
      return `${arg.label ?? name} is required.`
    }
    if (arg.kind === 'flag' && Boolean(values[arg.flag])) {
      const nested = validateRequiredArgs(arg.args, values, ctx)
      if (nested) return nested
    }
    if (arg.kind === 'choice') {
      const selected = String(values[arg.name] ?? arg.defaultValue ?? '')
      const nested = validateRequiredArgs(arg.yields[selected] ?? [], values, ctx)
      if (nested) return nested
    }
  }
  return null
}

export function validateUniaxialMaterialValues(values: Record<string, unknown>, ctx: SchemaContext): string | null {
  const schema = getAvailableSchemas(ctx.ndm).find((s) => s.cmd === 'OPS:uniaxialMaterial')
  if (!schema) return null
  const choice = schema.args.find((a): a is Extract<ArgDef, { kind: 'choice' }> => a.kind === 'choice' && a.name === 'matType')
  if (!choice) return null
  const matType = String(values.matType ?? choice.defaultValue ?? choice.options[0] ?? '').trim()
  if (!matType) return 'Material type is required.'
  const yielded = choice.yields[matType] ?? []
  return validateRequiredArgs(yielded, values, ctx)
}

export function validateCommand(cmd: Command, model: ModelState) {
  if (cmd.type === 'ADD_OPS' && cmd.fn === 'uniaxialMaterial') {
    const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
    const error = validateUniaxialMaterialValues(cmd.values, ctx)
    if (error) return error
  }
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
    const v = Array.isArray(values[arg.name]) ? (values[arg.name] as unknown[]) : []
    const len = resolveArgLen(arg.length, ctx)
    if (len === 'dynamic') return v.map((x: unknown) => num(x))
    return Array.from({ length: len }, (_, i) => num(v[i]))
  }
  if (arg.kind === 'flag') {
    if (!values[arg.flag]) return []
    return [arg.flag, ...arg.args.flatMap((child) => flattenArgValues(child, values, ctx, fallbackMatTag))]
  }
  if (arg.kind === 'choice') {
    const selected = String(values[arg.name] ?? arg.defaultValue ?? arg.options[0] ?? '')
    return [selected, ...(arg.yields[selected] ?? []).flatMap((child) => flattenArgValues(child, values, ctx, fallbackMatTag))]
  }
  if (arg.kind === 'idlist') {
    // idlist fields insert one command per id (see CommandForm's submitValues); the
    // preview can only show a single call, so it previews the first id.
    const ids = Array.isArray(values[arg.name]) ? (values[arg.name] as unknown[]) : []
    return ids.length ? [Math.trunc(num(ids[0]))] : []
  }
  return []
}

function formatPyLiteral(v: string | number | boolean | null): string {
  if (typeof v === 'string') return `'${v}'`
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (v === null) return 'None'
  return String(v)
}

/** Live python-call preview for a schema using the form's current (or default) values. */
export function commandPreviewLine(schema: CommandSchema, values: Record<string, unknown>, ctx: SchemaContext, fallbackMatTag = 1): string {
  const args = [...schema.args, ...schema.optional].flatMap((arg) => flattenArgValues(arg, values, ctx, fallbackMatTag))
  return `${schema.fn}(${args.map(formatPyLiteral).join(', ')})`
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
