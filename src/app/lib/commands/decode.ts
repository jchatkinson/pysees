import type { Model } from '@/app/types/model'
import type { SchemaContext } from '@/app/types/schema'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { getSchemaForFn } from '@/app/lib/commandSchemas'
import { decodeArgs } from '@/app/lib/commands/grammar'
import { CHILD_SHAPES, INLINE_SERIES, beamUniformOrder, childShapeKey, elementArgs, elementByOpsName, elementNodeCount } from '@/app/lib/commands/tables'
import { ELE_LOAD_TYPES } from '@/app/lib/shells'
import { isFlag, isNum, need, numsFrom, skip, tag, type Tok } from '@/app/lib/commands/tokens'

/** What decoding needs from its caller: the model so far, the enclosing pattern / fiber section, and a way to emit writes and notes. */
export interface DecodeSink extends SchemaContext {
  model: Model
  pattern: number | null
  fiberSection: number | null
  emit(write: ModelWrite): void
  note(severity: 'info' | 'warning', message: string): void
}

/** Script command names (case-insensitive) that decode to model entities. */
export const MODEL_FNS = ['model', 'node', 'fix', 'mass', 'element', 'uniaxialMaterial', 'nDMaterial', 'section', 'fiber', 'patch', 'layer', 'geomTransf', 'beamIntegration', 'timeSeries', 'pattern', 'load', 'eleLoad', 'sp', 'equalDOF', 'equalDOF_Mixed', 'rigidDiaphragm', 'rigidLink', 'region']
const CANON = new Map(MODEL_FNS.map((f) => [f.toLowerCase(), f]))
export const canonicalFn = (fn: string) => CANON.get(fn.toLowerCase())

/** Decodes one model command's tokens into writes on the sink; throws `Skip` (with a reason) for anything unrepresentable. */
export function decodeCommand(fn: string, t: Tok[], s: DecodeSink) {
  switch (fn) {
    case 'model': return
    case 'node': return node(t, s)
    case 'fix': return fix(t, s)
    case 'mass': return s.emit({ kind: 'mass', entity: { nodeId: tag(t[0], 'node tag'), values: need(t, 1, s.ndf, 'mass values') } })
    case 'element': return element(t, s)
    case 'fiber': case 'patch': case 'layer': return sectionChild(fn, t, s)
    case 'pattern': return pattern(t, s)
    case 'load': return load(t, s)
    case 'eleLoad': return eleLoad(t, s)
    case 'sp': return sp(t, s)
    default: return generic(fn, t, s)
  }
}

function node(t: Tok[], s: DecodeSink) {
  const id = tag(t[0], 'node tag')
  s.emit({ kind: 'node', entity: { id, coords: need(t, 1, s.ndm, 'coordinates') } })
  const m = t.indexOf('-mass')
  if (m >= 0) s.emit({ kind: 'mass', entity: { nodeId: id, values: need(t, m + 1, s.ndf, 'mass values') } })
}

function fix(t: Tok[], s: DecodeSink) {
  const nodeId = tag(t[0], 'node tag')
  const flags = need(t, 1, s.ndf, `${s.ndf} fixity flags`)
  s.emit({ kind: 'fix', entity: { nodeId, dofs: flags.map((f, i) => (f ? i + 1 : 0)).filter(Boolean) } })
}

function element(t: Tok[], s: DecodeSink) {
  const spec = typeof t[0] === 'string' ? elementByOpsName(t[0]) : undefined
  if (!spec) return skip(`element type "${t[0]}" is not supported by PySees yet`)
  const id = tag(t[1], 'element tag')
  const rest = t.slice(2)
  const count = elementNodeCount(spec)
  const nodes = numsFrom(rest, 0).slice(0, count)
  if (nodes.length !== count) return skip(`expected ${count} node tags`)
  const tail = rest.slice(count)
  const nums = numsFrom(tail, 0)
  const keys = elementArgs(spec, s.ndm)
  const put = (args: Record<string, unknown>) => s.emit({ kind: 'element', entity: { id, eleType: spec.eleType, nodes, args } })
  if (spec.eleType === 'DispBeamColumn' && nums.length === 3) {
    // Older Tcl form `numIntgrPts secTag transfTag`: becomes a Legendre beamIntegration plus the current-form element.
    const [n, secTag, transfTag] = nums
    const integrationTag = s.model.nextIds.beamIntegration
    s.emit({ kind: 'beamIntegration', entity: { id: integrationTag, intType: 'Legendre', args: { type: 'Legendre', tag: integrationTag, secTag, n } } })
    s.note('info', `dispBeamColumn ${id}: numIntgrPts form converted to Legendre beamIntegration ${integrationTag}.`)
    return put({ transfTag, integrationTag })
  }
  if (spec.exact ? nums.length !== keys.length : nums.length < keys.length) {
    return skip(`expected ${keys.join(' ')}${spec.exact ? ' (the section-based form is not supported)' : ''}`)
  }
  const args: Record<string, unknown> = Object.fromEntries(keys.map((k, i) => [k, nums[i]]))
  for (const [flag, { key, vec }] of Object.entries(spec.flags ?? {})) {
    const at = tail.indexOf(flag)
    if (at < 0) continue
    if (vec) args[key] = numsFrom(tail, at + 1)
    else if (isNum(tail[at + 1])) args[key] = tail[at + 1]
  }
  put(args)
}

/** Commands fully described by a generated schema (materials, sections, time series, constraints…). */
function generic(fn: string, t: Tok[], s: DecodeSink) {
  const schema = getSchemaForFn(fn, s.ndm)
  if (!schema) return skip('no schema for this command')
  const { values, consumed, problems } = decodeArgs(schema.args, t, s)
  if (problems.length) return skip(problems[0])
  if (consumed < t.length) s.note('warning', `${fn}: ${t.length - consumed} extra argument(s) ignored (${t.slice(consumed, consumed + 3).join(' ')}…).`)
  const result = schema.create(values, s.model)
  if (result.target !== 'model') return skip('not a model command')
  s.emit(result.write)
}

function pattern(t: Tok[], s: DecodeSink) {
  // `pattern Plain 1 Linear {…}` names the series instead of numbering one — create it so the pattern can reference a tag.
  if (typeof t[0] === 'string' && t[0].toLowerCase() === 'plain' && typeof t[2] === 'string' && !isFlag(t[2])) {
    const tsType = INLINE_SERIES.find((o) => o.toLowerCase() === (t[2] as string).toLowerCase())
    if (!tsType) return skip(`unsupported inline time series "${t[2]}"`)
    const tsTag = s.model.nextIds.timeSeries
    s.emit({ kind: 'timeSeries', entity: { id: tsTag, tsType, args: { type: tsType, tag: tsTag, factor: 1 } } })
    t = [t[0], t[1], tsTag, ...t.slice(3)]
  }
  generic('pattern', t, s)
}

const inPattern = (s: DecodeSink): number => s.pattern ?? skip('no enclosing pattern')

function load(t: Tok[], s: DecodeSink) {
  const patternId = inPattern(s)
  s.emit({ kind: 'patternChild', patternId, child: { kind: 'load', args: { nodeTag: tag(t[0], 'node tag'), values: need(t, 1, s.ndf, `${s.ndf} load values`) } } })
}

function sp(t: Tok[], s: DecodeSink) {
  const patternId = inPattern(s)
  const [nodeTag, dof, value] = need(t, 0, 3, 'nodeTag dof value')
  s.emit({ kind: 'patternChild', patternId, child: { kind: 'sp', args: { nodeTag, dof, value } } })
}

function eleLoad(t: Tok[], s: DecodeSink) {
  const patternId = inPattern(s)
  const type = t.indexOf('-type')
  if (t[type + 1] === '-shellPressure' || t[type + 1] === '-surfaceLoad') return skip('shell pressure loads are exported as nodal loads and cannot be read back as a pressure; the load was skipped')
  if (type < 0 || (t[type + 1] !== '-beamUniform' && t[type + 1] !== '-selfWeight')) return skip('only -type -beamUniform and -selfWeight are supported')
  const ele = t.indexOf('-ele')
  const range = t.indexOf('-range')
  const eleTags = ele >= 0 ? numsFrom(t, ele + 1) : range >= 0 ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(need(t, range + 1, 2, 'a range')) : skip('expected -ele or -range')
  const c = numsFrom(t, type + 2)
  if (t[type + 1] === '-selfWeight') {
    // A shell's self-weight factors, which OpenSees applies with the opposite sign of a gravity vector.
    if (c.length < 3) return skip('missing self-weight factors')
    return s.emit({ kind: 'patternChild', patternId, child: { kind: 'eleLoad', args: { eleTags, loadType: ELE_LOAD_TYPES[2], bx: 0 - c[0], by: 0 - c[1], bz: 0 - c[2] } } })
  }
  const order = beamUniformOrder(s.ndm)
  if (c.length < order.length - 1) return skip('missing load components')
  const args: Record<string, unknown> = { eleTags, wx: 0, wy: 0, wz: 0 }
  order.forEach((k, i) => { args[k] = c[i] ?? 0 })
  s.emit({ kind: 'patternChild', patternId, child: { kind: 'eleLoad', args } })
}

function sectionChild(kind: 'fiber' | 'patch' | 'layer', t: Tok[], s: DecodeSink) {
  const sectionId = s.fiberSection ?? skip('no enclosing Fiber section')
  const sub = kind === 'fiber' ? 'fiber' : typeof t[0] === 'string' ? t[0].toLowerCase() : ''
  const keys = CHILD_SHAPES[childShapeKey(kind, sub)] ?? skip(`unsupported ${kind} type "${sub}"`)
  const n = numsFrom(t, kind === 'fiber' ? 0 : 1)
  // Trailing optional angles of a circular patch / layer default to a full circle when omitted.
  const want = sub === 'circ' ? keys.length - 2 : keys.length
  if (n.length < want) return skip(`${kind} ${sub} expects ${keys.length} numbers, found ${n.length}`)
  s.emit({ kind: 'sectionChild', sectionId, child: { kind, subType: sub, args: Object.fromEntries(keys.slice(0, n.length).map((k, i) => [k, n[i]])) } })
}
