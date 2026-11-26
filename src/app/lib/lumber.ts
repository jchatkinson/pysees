import type { WallLayoutSpec } from '@/app/carapace/wasm/carapace_wasm'
import { derivedUnit, type BaseUnits, type LengthUnit } from '@/app/lib/units/units'

/**
 * Stud-wall members as lumber: a species/grade (its modulus E) and nominal sizes with ply counts, converted to the EA / EI the wall
 * layout carries. Kept beside the layout in the wall's args (`framing`); Carapace only ever sees the layout. Any member's EA / EI can be
 * overridden (`over`), which wins over the computed value.
 *
 * E values: CSA O86:19 Table 6.4 (structural joists and planks, structural light framing and studs) and NDS Supplement 2024 Tables 4A /
 * 4B (visually graded dimension lumber). The engineered grades are typical manufacturer values, not code values.
 */
export interface Grade { key: string; label: string; group: string; e: number; unit: 'MPa' | 'psi' }
export const GRADES: Grade[] = [
  { key: 'o86-dfl', label: 'D.Fir-L No.1/No.2', group: 'CSA O86', e: 11000, unit: 'MPa' },
  { key: 'o86-dfl-stud', label: 'D.Fir-L No.3/Stud', group: 'CSA O86', e: 10000, unit: 'MPa' },
  { key: 'o86-hf', label: 'Hem-Fir No.1/No.2', group: 'CSA O86', e: 11000, unit: 'MPa' },
  { key: 'o86-hf-stud', label: 'Hem-Fir No.3/Stud', group: 'CSA O86', e: 10000, unit: 'MPa' },
  { key: 'o86-spf', label: 'S-P-F No.1/No.2', group: 'CSA O86', e: 9500, unit: 'MPa' },
  { key: 'o86-spf-stud', label: 'S-P-F No.3/Stud', group: 'CSA O86', e: 9000, unit: 'MPa' },
  { key: 'o86-north', label: 'Northern No.1/No.2', group: 'CSA O86', e: 7000, unit: 'MPa' },
  { key: 'o86-north-stud', label: 'Northern No.3/Stud', group: 'CSA O86', e: 6500, unit: 'MPa' },
  { key: 'nds-dfl', label: 'Douglas Fir-Larch No.2', group: 'NDS', e: 1.6e6, unit: 'psi' },
  { key: 'nds-dfl-stud', label: 'Douglas Fir-Larch Stud', group: 'NDS', e: 1.4e6, unit: 'psi' },
  { key: 'nds-hf', label: 'Hem-Fir No.2', group: 'NDS', e: 1.3e6, unit: 'psi' },
  { key: 'nds-hf-stud', label: 'Hem-Fir Stud', group: 'NDS', e: 1.2e6, unit: 'psi' },
  { key: 'nds-spf', label: 'Spruce-Pine-Fir No.1/No.2', group: 'NDS', e: 1.4e6, unit: 'psi' },
  { key: 'nds-spf-stud', label: 'Spruce-Pine-Fir Stud', group: 'NDS', e: 1.2e6, unit: 'psi' },
  { key: 'nds-sp', label: 'Southern Pine No.2', group: 'NDS', e: 1.4e6, unit: 'psi' },
  { key: 'nds-sp-stud', label: 'Southern Pine No.3 and Stud', group: 'NDS', e: 1.3e6, unit: 'psi' },
  { key: 'lvl', label: 'LVL 2.0E (typical)', group: 'Engineered', e: 2.0e6, unit: 'psi' },
  { key: 'lsl', label: 'LSL 1.55E (typical)', group: 'Engineered', e: 1.55e6, unit: 'psi' },
]
export const CUSTOM = 'custom'

/** Actual sizes, mm: dimension lumber (b × d) and LVL plies. */
export interface Size { key: string; label: string; b: number; d: number }
export const SIZES: Size[] = [
  { key: '2x3', label: '2x3 · 38×64', b: 38, d: 64 }, { key: '2x4', label: '2x4 · 38×89', b: 38, d: 89 }, { key: '2x6', label: '2x6 · 38×140', b: 38, d: 140 },
  { key: '2x8', label: '2x8 · 38×184', b: 38, d: 184 }, { key: '2x10', label: '2x10 · 38×235', b: 38, d: 235 }, { key: '2x12', label: '2x12 · 38×286', b: 38, d: 286 },
  { key: 'lvl9', label: 'LVL 1¾×9½ · 45×241', b: 45, d: 241 }, { key: 'lvl12', label: 'LVL 1¾×11⅞ · 45×302', b: 45, d: 302 }, { key: 'lvl14', label: 'LVL 1¾×14 · 45×356', b: 45, d: 356 },
]
/** Rim board thicknesses, mm; its depth is the floor zone's. */
export const RIMS: Size[] = [{ key: 'rim38', label: '2x lumber · 38', b: 38, d: 0 }, { key: 'rim32', label: '1¼ rim board · 32', b: 32, d: 0 }, { key: 'rim29', label: '1⅛ rim board · 29', b: 29, d: 0 }]
/** Select items: grades (grouped by source, with E), stud sizes, header sizes. */
export const GRADE_ITEMS = [...GRADES.map((g) => ({ value: g.key, label: `${g.label} — E ${g.e.toLocaleString('en-US')} ${g.unit}`, group: g.group })), { value: CUSTOM, label: 'Custom E', group: 'Other' }]
export const STUD_ITEMS = SIZES.filter((z) => z.b === 38 && z.d <= 184).map((z) => ({ value: z.key, label: z.label }))
export const HEADER_ITEMS = SIZES.map((z) => ({ value: z.key, label: z.label }))
export const sizeOf = (key: string) => SIZES.find((s) => s.key === key) ?? RIMS.find((s) => s.key === key)

export type Member = 'studEa' | 'endEa' | 'topEa' | 'topEi' | 'bottomEa' | 'bottomEi' | 'rimEa'
export interface OpeningFraming { header: string; headerPlies: number; jackPlies: number; /** Window sill height above the base (drawing only; Carapace has no sill). */ sill?: number; over?: { headerEi?: number; jackEa?: number } }
export interface WallFraming {
  /** Grade key, or `custom` with `e` in model stress units. */
  grade: string; e?: number
  stud: string; endPlies: number; topPlies: number; bottomPlies: number
  headerGrade: string; headerE?: number
  rim?: { size: string; plies: number; grade: string; e?: number }
  openings: OpeningFraming[]
  over?: Partial<Record<Member, number>>
}

/** Model-unit factors: one mm in the model's length unit, one MPa in its stress unit. A unitless model is assumed to be N–mm, kN–m or kip–in/ft by its wall height. */
export interface LumberScale { mm: number; mpa: number; psi: number; assumed: BaseUnits | null }
export function lumberScale(units: BaseUnits | undefined, height: number): LumberScale {
  const guess = (l: LengthUnit): BaseUnits => ({ length: l, force: l === 'mm' ? 'N' : l === 'm' ? 'kN' : 'kip', time: 's' })
  const len: LengthUnit = height >= 500 ? 'mm' : height >= 30 ? 'in' : height >= 6 ? 'ft' : 'm'
  const base = units ?? guess(len)
  const L = derivedUnit('length', base.length, base.force, base.time).si, S = derivedUnit('stress', base.length, base.force, base.time).si
  return { mm: 1e-3 / L, mpa: 1e6 / S, psi: 6894.757293168 / S, assumed: units ? null : base }
}

/** E of a grade in model stress units (the custom value for `custom`), or NaN. */
export function gradeE(grade: string, custom: number | undefined, s: LumberScale): number {
  if (grade === CUSTOM) return custom ?? NaN
  const g = GRADES.find((x) => x.key === grade)
  return g ? g.e * (g.unit === 'MPa' ? s.mpa : s.psi) : NaN
}

/** The computed (un-overridden) stiffness of every member. */
export function framingStiffness(f: WallFraming, s: LumberScale, floorDepth?: number) {
  const E = gradeE(f.grade, f.e, s), Eh = gradeE(f.headerGrade, f.headerE, s)
  const st = sizeOf(f.stud), b = (st?.b ?? NaN) * s.mm, d = (st?.d ?? NaN) * s.mm
  const one = E * b * d, flat = E * d * b ** 3 / 12
  const rim = f.rim && sizeOf(f.rim.size)
  return {
    studEa: one, endEa: f.endPlies * one, topEa: f.topPlies * one, topEi: f.topPlies * flat, bottomEa: f.bottomPlies * one, bottomEi: f.bottomPlies * flat,
    rimEa: f.rim && rim && floorDepth ? f.rim.plies * gradeE(f.rim.grade, f.rim.e, s) * rim.b * s.mm * floorDepth : undefined,
    openings: f.openings.map((o) => { const h = sizeOf(o.header); return { jackEa: o.jackPlies * one, headerEi: o.headerPlies * Eh * (h?.b ?? NaN) * s.mm * ((h?.d ?? NaN) * s.mm) ** 3 / 12 } }),
  }
}

/** The layout with every EA / EI set from the framing (overrides win). End posts are the studs at x = 0 and x = length. */
export function applyFraming(layout: WallLayoutSpec, f: WallFraming, s: LumberScale): WallLayoutSpec {
  const k = framingStiffness(f, s, layout.floor?.depth), o = f.over ?? {}
  const pick = (m: Member) => o[m] ?? (k[m] as number)
  const L = layout.length
  return {
    ...layout,
    studs: layout.studs.map((st) => ({ x: st.x, ea: st.x <= 1e-9 * L || st.x >= L * (1 - 1e-9) ? pick('endEa') : pick('studEa') })),
    topEa: pick('topEa'), // An override of 0 keeps a top chord without bending stiffness.
    topEi: o.topEi === 0 ? undefined : pick('topEi'), bottomEa: pick('bottomEa'), bottomEi: pick('bottomEi'),
    openings: (layout.openings ?? []).map((op, i) => ({ ...op, jackEa: f.openings[i]?.over?.jackEa ?? k.openings[i]?.jackEa ?? op.jackEa, headerEi: f.openings[i]?.over?.headerEi ?? k.openings[i]?.headerEi ?? op.headerEi })),
    ...(layout.floor ? { floor: { ...layout.floor, rimEa: o.rimEa ?? k.rimEa ?? layout.floor.rimEa } } : {}),
  }
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b))
const plies = (ea: number, one: number) => Math.min(6, Math.max(1, Math.round(ea / one) || 1))

/**
 * Framing for a wall that has none (made before sizes, or by the template): the stud size and preset grade whose E·b·d is the stud EA,
 * else the size nearest a typical E with E then custom; plies from EA ratios; anything the sizes don't reproduce becomes an override, so
 * `applyFraming(layout, guessFraming(layout, s), s)` gives the layout back.
 */
export function guessFraming(layout: WallLayoutSpec, s: LumberScale, metric = true): WallFraming {
  const L = layout.length
  const interior = layout.studs.filter((x) => x.x > 0 && x.x < L)
  const studEa = [...interior.reduce((m, x) => m.set(x.ea, (m.get(x.ea) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? layout.studs[0]?.ea ?? 1
  const lumber = SIZES.filter((z) => z.b === 38 && z.d <= 140)
  let grade = '', stud = '', e: number | undefined
  for (const g of GRADES) for (const z of lumber) if (!stud && near(gradeE(g.key, undefined, s) * z.b * z.d * s.mm ** 2, studEa)) { grade = g.key; stud = z.key }
  if (!stud) {
    const typical = gradeE(metric ? 'o86-spf' : 'nds-spf', undefined, s)
    const z = lumber.reduce((best, z) => (Math.abs(Math.log(studEa / (typical * z.b * z.d * s.mm ** 2))) < Math.abs(Math.log(studEa / (typical * best.b * best.d * s.mm ** 2))) ? z : best))
    grade = CUSTOM; stud = z.key; e = studEa / (z.b * z.d * s.mm ** 2)
  }
  const E = gradeE(grade, e, s), z = sizeOf(stud)!, one = E * z.b * z.d * s.mm ** 2
  const endEa = layout.studs.find((x) => x.x === 0)?.ea ?? studEa
  const f: WallFraming = { grade, ...(e !== undefined ? { e } : {}), stud, endPlies: plies(endEa, one), topPlies: plies(layout.topEa, one), bottomPlies: plies(layout.bottomEa, one), headerGrade: grade, ...(e !== undefined ? { headerE: e } : {}), openings: [] }
  f.openings = (layout.openings ?? []).map((o) => {
    // The deepest lumber header whose 2-ply EI is at most the stored one, then plies from the ratio.
    const h = [...SIZES].filter((x) => x.b === 38).reverse().find((x) => 2 * E * x.b * (x.d * s.mm) ** 3 * s.mm / 12 <= o.headerEi * 1.001) ?? sizeOf('2x6')!
    return { header: h.key, headerPlies: plies(o.headerEi, E * h.b * s.mm * (h.d * s.mm) ** 3 / 12), jackPlies: plies(o.jackEa, one) }
  })
  if (layout.floor) {
    const rimEa = layout.floor.rimEa, depth = layout.floor.depth
    const r = RIMS.find((x) => near(gradeE(grade, e, s) * x.b * s.mm * depth, rimEa)) ?? RIMS[1]
    const re = rimEa / (r.b * s.mm * depth)
    f.rim = near(re, E) ? { size: r.key, plies: 1, grade, ...(e !== undefined ? { e } : {}) } : { size: r.key, plies: 1, grade: CUSTOM, e: re }
  }
  // Whatever the sizes miss is an override.
  const k = framingStiffness(f, s, layout.floor?.depth), over: Partial<Record<Member, number>> = {}
  const stored: Record<Member, number | undefined> = { studEa, endEa, topEa: layout.topEa, topEi: layout.topEi, bottomEa: layout.bottomEa, bottomEi: layout.bottomEi, rimEa: layout.floor?.rimEa }
  for (const m of Object.keys(stored) as Member[]) { const v = stored[m], c = k[m] as number | undefined; if (v !== undefined && (c === undefined || !near(v, c))) over[m] = v }
  if (layout.topEi === undefined) over.topEi = 0
  if (Object.keys(over).length) f.over = over
  f.openings.forEach((o, i) => {
    const st = layout.openings![i], c = k.openings[i], ov: OpeningFraming['over'] = {}
    if (!near(st.jackEa, c.jackEa)) ov.jackEa = st.jackEa
    if (!near(st.headerEi, c.headerEi)) ov.headerEi = st.headerEi
    if (Object.keys(ov).length) o.over = ov
  })
  return f
}
