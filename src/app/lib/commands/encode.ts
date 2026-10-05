import type { Model, PatternEntity } from '@/app/types/model'
import type { SchemaContext } from '@/app/types/schema'
import { getSchemaForFn } from '@/app/lib/commandSchemas'
import { encodeArgs } from '@/app/lib/commands/grammar'
import { CHILD_SHAPES, beamUniformOrder, childShapeKey, elementArgs, elementByType } from '@/app/lib/commands/tables'
import type { Call, Tok } from '@/app/lib/commands/tokens'

const byId = <T extends { id: number }>(m: Map<number, T>) => [...m.values()].sort((a, b) => a.id - b.id)

/** A schema-described command from a stored entity. `type` restores the schema's discriminator for entities that predate it in `args`. */
function schemaCall(fn: string, type: string | undefined, args: Record<string, unknown>, ctx: SchemaContext): Call {
  const schema = getSchemaForFn(fn, ctx.ndm)
  if (!schema) return { fn, args: Object.values(args).filter((v): v is Tok => typeof v === 'number' || typeof v === 'string') }
  const choice = schema.args.find((a) => a.kind === 'choice')
  const values = choice && type !== undefined ? { [choice.name]: type, ...args } : args
  return { fn, args: encodeArgs(schema.args, values, ctx, Number(args.matTag) || 1) }
}

/** An analysis-domain command from its values bag; `__args` (set by analysis blocks) is an exact positional list. */
export function encodeOps(fn: string, values: Record<string, unknown>, ctx: SchemaContext): Call {
  if (Array.isArray(values.__args)) {
    return { fn, args: (values.__args as (Tok | boolean | null)[]).flatMap((v): Tok[] => (v === null ? [] : typeof v === 'boolean' ? [v ? 1 : 0] : [v])) }
  }
  return schemaCall(fn, undefined, values, ctx)
}

export function encodePattern(pattern: PatternEntity, ctx: SchemaContext): Call {
  const call = schemaCall('pattern', pattern.patternType, pattern.args, ctx)
  call.body = pattern.children.map((child): Call => {
    if (child.kind === 'load') {
      const a = child.args as { nodeTag: number; values: number[] }
      return { fn: 'load', args: [a.nodeTag, ...a.values] }
    }
    if (child.kind === 'sp') {
      const a = child.args as { nodeTag: number; dof: number; value: number }
      return { fn: 'sp', args: [a.nodeTag, a.dof, a.value] }
    }
    const a = child.args as { eleTags: number[]; wx?: number; wy?: number; wz?: number }
    const comps = beamUniformOrder(ctx.ndm).map((k) => a[k] ?? 0)
    return { fn: 'eleLoad', args: ['-ele', ...a.eleTags, '-type', '-beamUniform', ...comps] }
  })
  if (pattern.name) call.comment = pattern.name.replace(/[\r\n]+/g, ' ')
  return call
}

/** The model as commands in a dependency-safe order, with the patterns in `deferredPatterns` left out (declared later, at the stage that claims them). */
export function encodeModel(model: Model, deferredPatterns: ReadonlySet<number> = new Set()): Call[] {
  const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
  const calls: Call[] = [{ fn: 'model', args: ['basic', '-ndm', ctx.ndm, '-ndf', ctx.ndf] }]
  for (const n of byId(model.nodes)) calls.push({ fn: 'node', args: [n.id, ...n.coords] })
  for (const m of [...model.masses.values()].sort((a, b) => a.nodeId - b.nodeId)) calls.push({ fn: 'mass', args: [m.nodeId, ...m.values] })
  for (const m of byId(model.materials)) calls.push(schemaCall(m.kind === 'nD' ? 'nDMaterial' : 'uniaxialMaterial', m.matType, m.args, ctx))
  for (const sec of byId(model.sections)) {
    const call = schemaCall('section', sec.secType, sec.args, ctx)
    if (sec.children.length) {
      call.body = sec.children.map((c) => {
        const keys = CHILD_SHAPES[childShapeKey(c.kind, c.subType)] ?? Object.keys(c.args)
        const vals = keys.map((k) => c.args[k]).filter((v): v is number => typeof v === 'number')
        return { fn: c.kind, args: c.kind === 'fiber' ? vals : [c.subType, ...vals] }
      })
    }
    calls.push(call)
  }
  for (const gt of byId(model.geomTransfs)) calls.push(schemaCall('geomTransf', gt.transfType, gt.args, ctx))
  for (const bi of byId(model.beamIntegrations)) calls.push(schemaCall('beamIntegration', bi.intType, bi.args, ctx))
  for (const e of byId(model.elements)) {
    const spec = elementByType(e.eleType)
    if (!spec) { calls.push({ fn: 'element', args: [e.eleType, e.id, ...e.nodes] }); continue }
    const args: Tok[] = [spec.opsName, e.id, ...e.nodes, ...elementArgs(spec, ctx.ndm).map((k) => (e.args[k] as Tok | undefined) ?? 0)]
    for (const [flag, { key, vec }] of Object.entries(spec.flags ?? {})) {
      const v = e.args[key]
      if (vec ? Array.isArray(v) && v.length : typeof v === 'number') args.push(flag, ...(vec ? (v as number[]) : [v as number]))
    }
    calls.push({ fn: 'element', args })
  }
  for (const r of byId(model.regions)) calls.push(schemaCall('region', undefined, r.args, ctx))
  for (const m of byId(model.misc)) calls.push(schemaCall(m.fn, undefined, m.args, ctx))
  for (const mp of byId(model.mpConstraints)) calls.push(schemaCall(mp.kind, undefined, mp.args, ctx))
  for (const f of [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId)) {
    calls.push({ fn: 'fix', args: [f.nodeId, ...Array.from({ length: ctx.ndf }, (_, i) => (f.dofs.includes(i + 1) ? 1 : 0))] })
  }
  for (const ts of byId(model.timeSeries)) calls.push(schemaCall('timeSeries', ts.tsType, ts.args, ctx))
  for (const p of byId(model.patterns)) if (!deferredPatterns.has(p.id)) calls.push(encodePattern(p, ctx))
  return calls
}
