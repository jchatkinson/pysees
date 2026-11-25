import type { ElementEntity, Model } from '@/app/types/model'
import { isShell } from '@/app/lib/commands/tables'
import { isStudWall } from '@/app/lib/studWalls'
import { SECTION_TEMPLATES } from '@/app/lib/sections/templates'

/**
 * A frame / shell / link property is not stored: it is the group of elements sharing an element type and everything in their args
 * except the per-member orientation (`transfTag`). `args` is the template a drawn element copies (a transform is added per member).
 */
export interface DerivedProperty {
  key: string
  name: string
  kind: 'frame' | 'shell' | 'link'
  eleType: string
  args: Record<string, unknown>
  elementIds: number[]
}

/** What a draw tool creates: an element type and its args minus the transform. */
export interface DrawTemplate { eleType: string; args: Record<string, unknown> }

const PER_MEMBER = new Set(['transfTag'])

export function templateOf(e: Pick<ElementEntity, 'eleType' | 'args'>): DrawTemplate {
  return { eleType: e.eleType, args: Object.fromEntries(Object.entries(e.args).filter(([k]) => !PER_MEMBER.has(k))) }
}

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v))

export const templateKey = (t: DrawTemplate) => `${t.eleType}|${stable(t.args)}`

const kindOf = (eleType: string): DerivedProperty['kind'] => (isShell(eleType) ? 'shell' : /^zeroLength/.test(eleType) ? 'link' : 'frame')
const num = (v: unknown) => (typeof v === 'number' ? Number(v.toPrecision(4)) : v)

export function sectionName(model: Model, secTag: unknown): string {
  const s = model.sections.get(Number(secTag))
  if (!s) return `Section ${String(secTag)}`
  const aisc = s.template?.params.aiscName
  if (aisc) return String(aisc)
  const label = s.template ? SECTION_TEMPLATES[s.template.kind]?.label : undefined
  return label ? `${label} S${s.id}` : `${s.secType} S${s.id}`
}

/** A readable name for a template: its section (through the integration for a fiber beam), or its defining numbers. */
export function templateName(model: Model, t: DrawTemplate): string {
  const a = t.args
  if (t.eleType === 'DispBeamColumn' || t.eleType === 'ForceBeamColumn') {
    const integ = model.beamIntegrations.get(Number(a.integrationTag))
    return integ ? sectionName(model, integ.args.secTag) : `${t.eleType} I${String(a.integrationTag)}`
  }
  if (t.eleType === 'ElasticBeamColumn') return `Elastic A=${num(a.A)} I=${num(a.Iz)}`
  if (t.eleType === 'Truss') return `Truss A=${num(a.A)} M${String(a.matTag)}`
  if (isShell(t.eleType)) return `${sectionName(model, a.secTag)} (${t.eleType})`
  if (t.eleType === 'zeroLengthSection') return `Spring ${sectionName(model, a.secTag)}`
  if (t.eleType === 'zeroLength') return `Spring M${(Array.isArray(a.mat) ? a.mat : []).join('/')}`
  return t.eleType
}

/** Every property in use, most-used first. Names that collide (same section, different element type or args) get a suffix. */
export function deriveProperties(model: Model): DerivedProperty[] {
  const groups = new Map<string, DerivedProperty>()
  for (const e of [...model.elements.values()].sort((a, b) => a.id - b.id)) {
    if (isStudWall(e.eleType)) continue // each wall has its own layout; not a property to draw with
    const t = templateOf(e)
    const key = templateKey(t)
    const g = groups.get(key)
    if (g) g.elementIds.push(e.id)
    else groups.set(key, { key, name: templateName(model, t), kind: kindOf(e.eleType), eleType: t.eleType, args: t.args, elementIds: [e.id] })
  }
  const out = [...groups.values()].sort((a, b) => b.elementIds.length - a.elementIds.length || a.name.localeCompare(b.name))
  const seen = new Map<string, number>()
  for (const p of out) {
    const n = (seen.get(p.name) ?? 0) + 1
    seen.set(p.name, n)
    if (n > 1) p.name = `${p.name} (${n})`
  }
  return out
}
