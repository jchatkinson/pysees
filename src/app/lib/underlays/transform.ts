import type { UnderlayEntity } from '@/app/types/underlays'
import { lengthSi, type LengthUnit } from '@/app/lib/units/units'

export type P2 = [number, number]
type Placement = Pick<UnderlayEntity, 'origin' | 'scale' | 'rotation'>

/** One PDF point in metres. */
export const POINT_M = 0.0254 / 72

export function pdfToWorld(u: Placement, p: P2): P2 {
  const c = Math.cos(u.rotation), s = Math.sin(u.rotation)
  return [u.origin[0] + u.scale * (c * p[0] - s * p[1]), u.origin[1] + u.scale * (s * p[0] + c * p[1])]
}

export function worldToPdf(u: Placement, w: P2): P2 {
  const c = Math.cos(u.rotation), s = Math.sin(u.rotation)
  const dx = (w[0] - u.origin[0]) / u.scale, dy = (w[1] - u.origin[1]) / u.scale
  return [c * dx + s * dy, -s * dx + c * dy]
}

/** The similarity (translate, rotate, uniform scale) taking page points `a`, `b` onto world points `wa`, `wb`. Null when either pair coincides. */
export function fromTwoPoints(a: P2, b: P2, wa: P2, wb: P2): Placement | null {
  const pd: P2 = [b[0] - a[0], b[1] - a[1]], wd: P2 = [wb[0] - wa[0], wb[1] - wa[1]]
  const lp = Math.hypot(...pd), lw = Math.hypot(...wd)
  if (lp === 0 || lw === 0) return null
  const scale = lw / lp
  const rotation = Math.atan2(wd[1], wd[0]) - Math.atan2(pd[1], pd[0])
  const c = Math.cos(rotation), s = Math.sin(rotation)
  return { scale, rotation, origin: [wa[0] - scale * (c * a[0] - s * a[1]), wa[1] - scale * (s * a[0] + c * a[1])] }
}

/** Inches in `1'-6 1/2"`, `6"`, `1/8"`, `10'`, `2.5'`. Null if it isn't an imperial length. */
function imperialInches(text: string): number | null {
  const m = /^\s*(?:(\d+(?:\.\d+)?)\s*(?:'|ft))?\s*-?\s*(?:(?:(\d+)\s+)?(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(?:"|in))?\s*$/.exec(text)
  if (!m || (m[1] === undefined && m[3] === undefined)) return null
  const ft = m[1] ? Number(m[1]) : 0
  let inch = 0
  if (m[3] !== undefined) inch = (m[2] ? Number(m[2]) : 0) + (m[4] ? Number(m[3]) / Number(m[4]) : Number(m[3]))
  return ft * 12 + inch
}

/** Real length per paper length for a printed scale: `1:100`, `1/8" = 1'-0"`, `1" = 20'`. Null if it doesn't parse. */
export function parseDrawingScale(text: string): number | null {
  const ratio = /^\s*1\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(text)
  if (ratio) return Number(ratio[1]) > 0 ? Number(ratio[1]) : null
  const [paper, real] = text.split('=')
  if (real === undefined) return null
  const p = imperialInches(paper), r = imperialInches(real)
  return p && r ? r / p : null
}

/** World length units per PDF point for a drawing at `ratio` (real / paper) in a model measured in `unit`. */
export const scaleFromRatio = (ratio: number, unit: LengthUnit) => (ratio * POINT_M) / lengthSi(unit)

/** Common printed scales for the import picker. */
export const DRAWING_SCALES = {
  imperial: ['1/16" = 1\'-0"', '3/32" = 1\'-0"', '1/8" = 1\'-0"', '3/16" = 1\'-0"', '1/4" = 1\'-0"', '3/8" = 1\'-0"', '1/2" = 1\'-0"', '1" = 10\'', '1" = 20\'', '1" = 40\''],
  metric: ['1:50', '1:75', '1:100', '1:150', '1:200', '1:250', '1:500'],
}

/** Rescales so world points `a`, `b` picked on the sheet end up `distance` apart, keeping `a` where it is. Null for a zero-length pick. */
export function calibrated(u: Placement, a: P2, b: P2, distance: number): Placement | null {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (d === 0 || !(distance > 0)) return null
  const pa = worldToPdf(u, a)
  return pinned({ ...u, scale: (u.scale * distance) / d }, pa, a)
}

/** The placement with the same scale and rotation that puts page point `p` at world `w`. */
function pinned(u: Placement, p: P2, w: P2): Placement {
  const at = pdfToWorld({ ...u, origin: [0, 0] }, p)
  return { ...u, origin: [w[0] - at[0], w[1] - at[1]] }
}

/**
 * Moves the sheet so world points picked on it (`s1`, optionally `s2`) land on targets `w1`, `w2`. One pair translates; two pairs also rotate
 * and, unless `keepScale`, rescale. Null when two pairs are degenerate.
 */
export function aligned(u: Placement, s1: P2, w1: P2, s2?: P2, w2?: P2, keepScale = false): Placement | null {
  const p1 = worldToPdf(u, s1)
  if (!s2 || !w2) return pinned(u, p1, w1)
  const p2 = worldToPdf(u, s2)
  const t = fromTwoPoints(p1, p2, w1, w2)
  if (!t) return null
  return keepScale ? pinned({ ...u, rotation: t.rotation }, p1, w1) : t
}

/** Page-point rectangle [x0, y0, x1, y1] spanned by two world points picked on the sheet, clipped to the page. Null when empty. */
export function cropFrom(u: Placement, pageSize: [number, number], a: P2, b: P2): [number, number, number, number] | null {
  const pa = worldToPdf(u, a), pb = worldToPdf(u, b)
  const clamp = (v: number, i: 0 | 1) => Math.min(pageSize[i], Math.max(0, v))
  const r: [number, number, number, number] = [clamp(Math.min(pa[0], pb[0]), 0), clamp(Math.min(pa[1], pb[1]), 1), clamp(Math.max(pa[0], pb[0]), 0), clamp(Math.max(pa[1], pb[1]), 1)]
  return r[2] - r[0] > 0 && r[3] - r[1] > 0 ? r : null
}
