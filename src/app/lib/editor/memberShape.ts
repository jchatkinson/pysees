import type { ElementEntity, Model, SectionEntity } from '@/app/types/model'
import type { SectionOutline } from '@/app/lib/sections/types'
import { sectionOutline } from '@/app/lib/sections/outline'
import { isShell } from '@/app/lib/commands/tables'

/**
 * What an extruded member looks like: its section outline in local (y, z), and whether that outline is real (a fiber section's shape)
 * or `nominal` (an elastic member's equivalent rectangle, from A and its second moments, or a square of the right area for an elastic
 * section or truss, which has no shape of its own).
 */
export interface MemberShape { key: string; outline: SectionOutline; nominal: boolean }

const square = (area: number): SectionOutline => {
  const h = Math.sqrt(area) / 2
  return { outer: [{ y: -h, z: -h }, { y: h, z: -h }, { y: h, z: h }, { y: -h, z: h }], holes: [] }
}
const rect = (hy: number, hz: number): SectionOutline => ({ outer: [{ y: -hy, z: -hz }, { y: hy, z: -hz }, { y: hy, z: hz }, { y: -hy, z: hz }], holes: [] })
/** The rectangle with the member's A and second moments (3D: depth along local z from Iy, width along y from Iz; 2D: depth along y from
 * Iz, width A / depth), or a square of its area when they're missing. */
function elasticOutline(args: Record<string, unknown>): SectionOutline | null {
  const a = positive(args.A)
  if (!a) return null
  const iy = positive(args.Iy), iz = positive(args.Iz)
  if (iy && iz) return rect(Math.sqrt(12 * iz / a) / 2, Math.sqrt(12 * iy / a) / 2)
  if (iz && args.Iy === undefined) { const d = Math.sqrt(12 * iz / a); return rect(d / 2, a / d / 2) }
  return square(a)
}
const shape = (outline: SectionOutline, nominal: boolean): MemberShape => ({ key: `${nominal ? 'n' : 'f'}|${JSON.stringify(outline)}`, outline, nominal })
const positive = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

/** The section a beam-column integrates (through its beam integration), if any. */
export function memberSection(model: Model, e: ElementEntity): SectionEntity | undefined {
  if (e.eleType !== 'DispBeamColumn' && e.eleType !== 'ForceBeamColumn') return undefined
  const integ = model.beamIntegrations.get(Number(e.args.integrationTag))
  return integ ? model.sections.get(Number(integ.args.secTag)) : undefined
}

/** The shape to sweep along a two-node member, or null when it has none to draw (springs, shells, unknown sections). */
export function memberShape(model: Model, e: ElementEntity): MemberShape | null {
  if (e.nodes.length !== 2 || isShell(e.eleType) || /^zeroLength/.test(e.eleType)) return null
  if (e.eleType === 'ElasticBeamColumn') { const o = elasticOutline(e.args); return o ? shape(o, true) : null }
  if (e.eleType === 'Truss') { const a = positive(e.args.A); return a ? shape(square(a), true) : null }
  const sec = memberSection(model, e)
  if (!sec) return null
  if (sec.secType === 'Elastic') { const a = positive(sec.args.a ?? sec.args.A); return a ? shape(square(a), true) : null }
  const outline = sectionOutline(sec)
  return outline.outer.length >= 3 ? shape(outline, false) : null
}

/** A shell's thickness from its `ElasticMembranePlateSection`, or null. */
export function shellThickness(model: Model, e: ElementEntity): number | null {
  if (!isShell(e.eleType)) return null
  return positive(model.sections.get(Number(e.args.secTag))?.args.h)
}
