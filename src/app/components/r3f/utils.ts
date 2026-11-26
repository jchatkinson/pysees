import type { UnitContext } from '@/app/lib/units/units'
import type { PatternEntity } from '@/app/types/model'

export function toVec3(coords: number[]): [number, number, number] {
  return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0]
}

/** One colour per pattern (by position in the sorted pattern list), shared with the View menu swatches. */
export const PATTERN_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
export const patternColor = (patternIds: number[], id: number) => PATTERN_COLORS[Math.max(0, patternIds.indexOf(id)) % PATTERN_COLORS.length]

/** Compact load magnitude for scene labels: 1.2k, 7.18, 3.4M, ... (3 significant figures). */
export function formatLoadValue(v: number): string {
  const abs = Math.abs(v)
  if (abs === 0) return '0'
  if (abs >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`
  if (abs >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`
  if (abs >= 1e-2) return `${+v.toPrecision(3)}`
  return v.toExponential(1)
}

/** Above this many in the view, ID and value labels are not drawn: past that they are clutter (and a mesh rebuild per change). */
export const LABEL_LIMIT = 5000

/** Above this many load arrows they are drawn as one batch, without value labels (one glyph and label each would stall a large model). */
const GLYPH_LIMIT = 500

/** Nodal load arrows (and labels) the visible patterns draw, before batching: above `GLYPH_LIMIT` they are batched, unlabelled. */
export function loadGlyphCount(patterns: PatternEntity[], hiddenPatterns: number[], showNodal: boolean): number {
  let n = 0
  for (const p of patterns) {
    if (hiddenPatterns.includes(p.id)) continue
    for (const c of p.children) {
      if (c.kind === 'load' && showNodal) n++
    }
  }
  return n
}
export const batchesLoads = (count: number) => count > GLYPH_LIMIT

/** An area load (force per area) as loads are usually quoted, in the displayed force over the displayed length squared (kN/m², kip/ft²). */
export function areaLoadText(units: UnitContext, v: number, withUnit = true): string {
  const length = units.toDisplay('length', 1)
  const text = formatLoadValue(units.toDisplay('force', v) / (length * length))
  return withUnit && units.active ? `${text} ${areaLoadUnit(units)}` : text
}
export const areaLoadUnit = (units: UnitContext) => (units.active ? `${units.symbol('force')}/${units.symbol('length')}²` : '')
