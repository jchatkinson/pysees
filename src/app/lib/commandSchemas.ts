import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { Model, ModelEntityKind } from '@/app/types/model'
import type { ArgDef, ArgLen, SchemaContext } from '@/app/types/schema'
import { GENERATED_COMMAND_SCHEMAS } from '@/app/generated/commandSchemas.generated'
import type { GeneratedArgDef } from '@/app/generated/commandSchemas.generated'
import { domainForFn, PATTERN_CHILD_FNS, SECTION_CHILD_FNS, type CommandDomain } from '@/app/lib/commandDomain'
import type { ModelWrite } from '@/app/lib/modelWrite'

export type SchemaResult =
  | { target: 'model'; write: ModelWrite }
  | { target: 'analysis'; command: AnalysisCommand }

export interface CommandSchema {
  cmd: string
  fn: string
  label: string
  domain: CommandDomain
  description?: string
  ndmFilter?: number[]
  args: ArgDef[]
  optional: ArgDef[]
  /** Only ever insertable as a child of a Fiber Section ('section') or a Pattern ('pattern'); hidden from the main add-command list. */
  childOnly?: 'section' | 'pattern'
  create: (values: Record<string, unknown>, model: Model, existingId?: number) => SchemaResult
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

// ─── V1 (hand-curated) model schemas: node / fix / mass / element ────────────

function nodeArgsFromGenerated(): ArgDef[] {
  return [vec('coords', 'Coordinates', 'ndm', [0, 0, 0])]
}

function fixArgsFromGenerated(): ArgDef[] {
  return [{ kind: 'idlist', name: 'nodeId', label: 'Node ID(s)' }, vec('dofs', 'DOF Fix Flags (0/1)', 'ndf', [1, 1, 1, 0, 0, 0])]
}

function massArgs(): ArgDef[] {
  return [{ kind: 'idlist', name: 'nodeId', label: 'Node ID(s)' }, vec('values', 'Mass Values', 'ndf', [0, 0, 0, 0, 0, 0])]
}

function elementArgsFromGenerated(): ArgDef[] {
  return [
    { kind: 'choice', name: 'eleType', label: 'Element Type', options: ['Truss', 'ElasticBeamColumn', 'zeroLengthSection'], defaultValue: 'Truss', yields: {
      Truss: [
        { kind: 'vec', name: 'nodes', label: 'Node IDs', length: 2, defaultValue: [1, 2], nodeSync: true },
        { kind: 'int', name: 'matTag', label: 'Material Tag', required: true },
      ],
      ElasticBeamColumn: [
        { kind: 'vec', name: 'nodes', label: 'Node IDs', length: 2, defaultValue: [1, 2], nodeSync: true },
        { kind: 'float', name: 'A', label: 'Area (A)', defaultValue: 1, required: true },
        { kind: 'float', name: 'E', label: "Young's Modulus (E)", defaultValue: 1, required: true },
        { kind: 'float', name: 'Iz', label: 'Moment of Inertia (Iz)', defaultValue: 1, required: true },
        { kind: 'int', name: 'transfTag', label: 'Transformation Tag', required: true },
      ],
      zeroLengthSection: [
        { kind: 'vec', name: 'nodes', label: 'Node IDs', length: 2, defaultValue: [1, 2], nodeSync: true },
        { kind: 'int', name: 'secTag', label: 'Section Tag', required: true },
      ],
    } },
  ]
}

const V1_MODEL_SCHEMAS: CommandSchema[] = [
  {
    cmd: 'ADD_NODE',
    fn: 'node',
    label: 'Node',
    domain: 'model',
    description: 'Add a node at given coordinates',
    args: nodeArgsFromGenerated(),
    optional: [],
    create: (values, model, existingId) => ({
      target: 'model',
      write: { kind: 'node', entity: { id: existingId ?? model.nextIds.node, coords: nums(values.coords) } },
    }),
  },
  {
    cmd: 'FIX',
    fn: 'fix',
    label: 'Fix Node',
    domain: 'model',
    description: "Restrain a node's degrees of freedom",
    args: fixArgsFromGenerated(),
    optional: [],
    create: (values) => {
      const flags = ints(values.dofs)
      const dofs = flags.map((flag, idx) => (flag ? idx + 1 : 0)).filter(Boolean)
      return { target: 'model', write: { kind: 'fix', entity: { nodeId: Math.trunc(num(values.nodeId, 1)), dofs } } }
    },
  },
  {
    cmd: 'MASS',
    fn: 'mass',
    label: 'Nodal Mass',
    domain: 'model',
    description: 'Assign mass to a node',
    args: massArgs(),
    optional: [],
    create: (values) => ({
      target: 'model',
      write: { kind: 'mass', entity: { nodeId: Math.trunc(num(values.nodeId, 1)), values: nums(values.values) } },
    }),
  },
  {
    cmd: 'ADD_ELEMENT',
    fn: 'element',
    label: 'Element',
    domain: 'model',
    description: 'Add an element connecting nodes',
    args: elementArgsFromGenerated(),
    optional: [],
    create: (values, model, existingId) => {
      const eleType = String(values.eleType ?? 'Truss')
      const args = eleType === 'Truss'
        ? { matTag: Math.trunc(num(values.matTag)) }
        : eleType === 'ElasticBeamColumn'
        ? { A: num(values.A), E: num(values.E), Iz: num(values.Iz), transfTag: Math.trunc(num(values.transfTag)) }
        : { secTag: Math.trunc(num(values.secTag)) }
      return {
        target: 'model',
        write: { kind: 'element', entity: { id: existingId ?? model.nextIds.element, eleType, nodes: ints(values.nodes), args } },
      }
    },
  },
]

// ─── Pattern children: load / eleLoad / sp ───────────────────────────────────

const PATTERN_CHILD_SCHEMAS: CommandSchema[] = [
  {
    cmd: 'PATTERN_CHILD:load',
    fn: 'load',
    label: 'Nodal Load',
    domain: 'model',
    childOnly: 'pattern',
    description: 'Apply a load to a node under this pattern',
    args: [{ kind: 'idlist', name: 'nodeId', label: 'Node ID(s)' }, vec('values', 'Load Values', 'ndf', [0, 0, 0, 0, 0, 0])],
    optional: [],
    create: (values) => ({
      target: 'model',
      write: {
        kind: 'patternChild',
        patternId: Math.trunc(num(values.patternId)),
        child: { kind: 'load', args: { nodeTag: Math.trunc(num(values.nodeId, 1)), values: nums(values.values) } },
        childIndex: typeof values.childIndex === 'number' ? values.childIndex : undefined,
      },
    }),
  },
  {
    cmd: 'PATTERN_CHILD:sp',
    fn: 'sp',
    label: 'Imposed Motion (sp)',
    domain: 'model',
    childOnly: 'pattern',
    description: 'Prescribe a displacement at a node DOF under this pattern',
    args: [
      { kind: 'int', name: 'nodeTag', label: 'Node Tag', required: true },
      { kind: 'int', name: 'dof', label: 'DOF', required: true },
      { kind: 'float', name: 'value', label: 'Value', required: true },
    ],
    optional: [],
    create: (values) => ({
      target: 'model',
      write: {
        kind: 'patternChild',
        patternId: Math.trunc(num(values.patternId)),
        child: { kind: 'sp', args: { nodeTag: Math.trunc(num(values.nodeTag)), dof: Math.trunc(num(values.dof)), value: num(values.value) } },
        childIndex: typeof values.childIndex === 'number' ? values.childIndex : undefined,
      },
    }),
  },
  {
    cmd: 'PATTERN_CHILD:eleLoad',
    fn: 'eleLoad',
    label: 'Element Load (uniform)',
    domain: 'model',
    childOnly: 'pattern',
    description: 'Apply a uniform transverse/axial load to elements under this pattern',
    args: [
      { kind: 'idlist', name: 'eleTags', label: 'Element Tag(s)' },
      { kind: 'float', name: 'wy', label: 'wy', defaultValue: 0 },
      { kind: 'float', name: 'wz', label: 'wz', defaultValue: 0 },
    ],
    optional: [],
    create: (values) => ({
      target: 'model',
      write: {
        kind: 'patternChild',
        patternId: Math.trunc(num(values.patternId)),
        child: { kind: 'eleLoad', args: { eleTags: ints(values.eleTags), wy: num(values.wy), wz: num(values.wz) } },
        childIndex: typeof values.childIndex === 'number' ? values.childIndex : undefined,
      },
    }),
  },
]


const V1_FNS = new Set<string>(['node', 'fix', 'mass', 'element'])
const CHILD_FNS = new Set<string>([...PATTERN_CHILD_FNS, ...SECTION_CHILD_FNS])

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

/** Generic entity-kind for model-domain fns that get a dedicated Model map; everything else lands in `misc`. */
const MODEL_ENTITY_KIND_BY_FN: Partial<Record<string, ModelWrite['kind']>> = {
  uniaxialMaterial: 'material',
  nDMaterial: 'material',
  section: 'section',
  geomTransf: 'geomTransf',
  beamIntegration: 'beamIntegration',
  equalDOF: 'mpConstraint',
  equalDOF_Mixed: 'mpConstraint',
  rigidDiaphragm: 'mpConstraint',
  rigidLink: 'mpConstraint',
  region: 'region',
  timeSeries: 'timeSeries',
  pattern: 'pattern',
}

function idKindForModelWriteKind(kind: ModelWrite['kind']): ModelEntityKind {
  switch (kind) {
    case 'material': return 'material'
    case 'section': return 'section'
    case 'geomTransf': return 'geomTransf'
    case 'beamIntegration': return 'beamIntegration'
    case 'mpConstraint': return 'mpConstraint'
    case 'region': return 'region'
    case 'timeSeries': return 'timeSeries'
    case 'pattern': return 'pattern'
    default: return 'misc'
  }
}

/** Walks the (possibly choice-nested) arg tree using the current values bag to find the entity's own tag field, if any. */
function resolveTagArgName(args: ArgDef[], values: Record<string, unknown>): string | null {
  for (const arg of args) {
    if (arg.kind === 'int') {
      const lower = arg.name.toLowerCase()
      if (lower.endsWith('tag') && !lower.includes('node') && !lower.includes('ele')) return arg.name
    }
    if (arg.kind === 'flag' && values[arg.flag]) {
      const nested = resolveTagArgName(arg.args, values)
      if (nested) return nested
    }
    if (arg.kind === 'choice') {
      const selected = String(values[arg.name] ?? arg.defaultValue ?? arg.options[0] ?? '')
      const nested = resolveTagArgName(arg.yields[selected] ?? [], values)
      if (nested) return nested
    }
  }
  return null
}

/** Reads the top-level choice's currently-selected option (the "type" string: matType/secType/transfType/...), if any. */
function resolveTypeValue(fn: string, args: ArgDef[], values: Record<string, unknown>): string {
  const choice = args.find((a): a is Extract<ArgDef, { kind: 'choice' }> => a.kind === 'choice')
  if (!choice) return fn
  return String(values[choice.name] ?? choice.defaultValue ?? choice.options[0] ?? fn)
}

const GENERATED_SCHEMAS: CommandSchema[] = GENERATED_COMMAND_SCHEMAS
  .filter((schema) => !V1_FNS.has(schema.fn) && !CHILD_FNS.has(schema.fn))
  .map((schema) => {
    const args = schema.args.map(mapGeneratedArg)
    const optional = schema.optional.map(mapGeneratedArg)
    const domain = domainForFn(schema.fn)
    return {
      cmd: `OPS:${schema.fn}`,
      fn: schema.fn,
      label: titleCase(schema.label || schema.fn),
      domain,
      description: genericSignature(schema.fn, args, optional),
      args,
      optional,
      create: (values, model, existingId): SchemaResult => {
        if (domain !== 'model') {
          return { target: 'analysis', command: { type: 'ANALYSIS_OPS', fn: schema.fn, values } }
        }
        const kind = MODEL_ENTITY_KIND_BY_FN[schema.fn] ?? 'misc'
        const idKind = idKindForModelWriteKind(kind)
        const tagArgName = resolveTagArgName([...args, ...optional], values)
        let id: number
        if (existingId !== undefined) {
          id = existingId
        } else if (tagArgName) {
          const raw = Number(values[tagArgName])
          id = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : model.nextIds[idKind]
        } else {
          id = model.nextIds[idKind]
        }
        if (tagArgName) values = { ...values, [tagArgName]: id }
        const typeValue = resolveTypeValue(schema.fn, args, values)

        if (kind === 'material') return { target: 'model', write: { kind: 'material', entity: { id, kind: schema.fn === 'nDMaterial' ? 'nD' : 'uniaxial', matType: typeValue, args: values } } }
        if (kind === 'section') return { target: 'model', write: { kind: 'section', entity: { id, secType: typeValue, args: values, children: [] } } }
        if (kind === 'geomTransf') return { target: 'model', write: { kind: 'geomTransf', entity: { id, transfType: typeValue, args: values } } }
        if (kind === 'beamIntegration') return { target: 'model', write: { kind: 'beamIntegration', entity: { id, intType: typeValue, args: values } } }
        if (kind === 'mpConstraint') return { target: 'model', write: { kind: 'mpConstraint', entity: { id, kind: schema.fn as 'equalDOF' | 'equalDOF_Mixed' | 'rigidDiaphragm' | 'rigidLink', args: values } } }
        if (kind === 'region') return { target: 'model', write: { kind: 'region', entity: { id, args: values } } }
        if (kind === 'timeSeries') return { target: 'model', write: { kind: 'timeSeries', entity: { id, tsType: typeValue, args: values } } }
        if (kind === 'pattern') return { target: 'model', write: { kind: 'pattern', entity: { id, patternType: typeValue, args: values, children: [] } } }
        return { target: 'model', write: { kind: 'misc', entity: { id, fn: schema.fn, args: values } } }
      },
    }
  })

export function getAvailableSchemas(ndm: number) {
  return [...V1_MODEL_SCHEMAS, ...GENERATED_SCHEMAS].filter((schema) => !schema.ndmFilter || schema.ndmFilter.includes(ndm))
}

export function getPatternChildSchemas() {
  return PATTERN_CHILD_SCHEMAS
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

export function initialValues(schema: CommandSchema, ctx: SchemaContext, model?: Model) {
  const out: Record<string, unknown> = {}
  for (const arg of schema.args) defaultsForArg(arg, ctx, out)
  for (const arg of schema.optional) defaultsForArg(arg, ctx, out)
  if (schema.fn === 'uniaxialMaterial' && (!Number.isFinite(Number(out.matTag)) || Number(out.matTag) <= 0)) out.matTag = model?.nextIds.material ?? 1
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

/** Validates a SchemaResult before it's written to the model/analysis history. */
export function validateSchemaResult(result: SchemaResult, model: Model, ctx: SchemaContext): string | null {
  if (result.target === 'analysis') {
    if (result.command.type === 'ANALYSIS_OPS' && result.command.fn === 'recorder') return null
    return null
  }
  const write = result.write
  if (write.kind === 'material' && write.entity.kind === 'uniaxial') {
    const error = validateUniaxialMaterialValues(write.entity.args, ctx)
    if (error) return error
  }
  if (write.kind === 'fix' && !model.nodes.has(write.entity.nodeId)) return `Node ${write.entity.nodeId} does not exist.`
  if (write.kind === 'mass' && !model.nodes.has(write.entity.nodeId)) return `Node ${write.entity.nodeId} does not exist.`
  if (write.kind === 'element') {
    if (write.entity.nodes.length < 2) return 'Element requires at least 2 node IDs.'
    if (write.entity.nodes.some((id) => !model.nodes.has(id))) return 'Element references one or more missing nodes.'
    if (write.entity.eleType === 'zeroLengthSection' && !model.sections.has(Number(write.entity.args.secTag))) return 'Section does not exist.'
  }
  if (write.kind === 'fix' && write.entity.dofs.length === 0) return 'Select at least one constrained DOF.'
  if (write.kind === 'patternChild' && !model.patterns.has(write.patternId)) return `Pattern ${write.patternId} does not exist.`
  if (write.kind === 'sectionChild' && !model.sections.has(write.sectionId)) return `Section ${write.sectionId} does not exist.`
  return null
}

/** The underlying OpenSeesPy function name for a stored model entity (used to look up its schema for editing). */
export function fnForModelEntity(kind: ModelWrite['kind'], entity: unknown): string {
  switch (kind) {
    case 'node': return 'node'
    case 'fix': return 'fix'
    case 'mass': return 'mass'
    case 'element': return 'element'
    case 'material': return (entity as { kind: 'uniaxial' | 'nD' }).kind === 'nD' ? 'nDMaterial' : 'uniaxialMaterial'
    case 'section': return 'section'
    case 'geomTransf': return 'geomTransf'
    case 'beamIntegration': return 'beamIntegration'
    case 'mpConstraint': return (entity as { kind: string }).kind
    case 'region': return 'region'
    case 'timeSeries': return 'timeSeries'
    case 'pattern': return 'pattern'
    case 'misc': return (entity as { fn: string }).fn
    default: return kind
  }
}

/** Seeds a CommandFormBody's `initial` values from a stored model entity, for editing. */
export function modelEntityToValues(kind: ModelWrite['kind'], entity: unknown, ctx: SchemaContext): Record<string, unknown> {
  if (kind === 'node') return { coords: [...(entity as { coords: number[] }).coords] }
  if (kind === 'fix') {
    const e = entity as { nodeId: number; dofs: number[] }
    return { nodeId: [e.nodeId], dofs: Array.from({ length: ctx.ndf }, (_, i) => (e.dofs.includes(i + 1) ? 1 : 0)) }
  }
  if (kind === 'mass') {
    const e = entity as { nodeId: number; values: number[] }
    return { nodeId: [e.nodeId], values: Array.from({ length: ctx.ndf }, (_, i) => e.values[i] ?? 0) }
  }
  if (kind === 'element') {
    const e = entity as { eleType: string; nodes: number[]; args: Record<string, unknown> }
    return { eleType: e.eleType, nodes: [...e.nodes], ...e.args }
  }
  const e = entity as { args: Record<string, unknown> }
  return { ...e.args }
}

export function getSchemaForFn(fn: string, ndm: number) {
  const schemas = getAvailableSchemas(ndm)
  return schemas.find((schema) => schema.fn === fn) ?? null
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

/** Turns a schema-shaped fn + values bag into a rendered `ops.fn(...)` call — used by the script exporter and analysis blocks.
 * `values.__args`, when present (set by analysis blocks), is an exact positional arg list and bypasses schema lookup entirely. */
export function renderOpsCall(fn: string, values: Record<string, unknown>, ctx: SchemaContext, schemaOverride?: CommandSchema): string {
  if (Array.isArray(values.__args)) {
    const args = values.__args as (string | number | boolean | null)[]
    return `${fn}(${args.map(formatPyLiteral).join(', ')})`
  }
  const schema = schemaOverride ?? getSchemaForFn(fn, ctx.ndm)
  if (!schema) return `${fn}(${Object.values(values).map((v) => formatPyLiteral(v as string | number | boolean | null)).join(', ')})`
  return commandPreviewLine(schema, values, ctx, Number(values.matTag) || 1)
}
