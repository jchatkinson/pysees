/**
 * Units. The model is stored in one consistent system (the *base units*: a length, a force and a time unit; Carapace and OpenSees are unitless
 * and just see those numbers). Display units are a presentation choice per quantity category: values convert at the UI boundary only.
 * A category is a dimension, written as exponents of [L, F, T]; every other unit (stress, mass, ...) derives from those three.
 */

export interface Dim { L: number; F: number; T: number }

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft'
export type ForceUnit = 'N' | 'kN' | 'MN' | 'lbf' | 'kip'
export type TimeUnit = 's'
/** The fixed system a model's numbers are in. */
export interface BaseUnits { length: LengthUnit; force: ForceUnit; time: TimeUnit }

/** SI factors: metres, newtons, seconds. */
const LENGTHS: Record<LengthUnit, number> = { mm: 1e-3, cm: 1e-2, m: 1, in: 0.0254, ft: 0.3048 }
const FORCES: Record<ForceUnit, number> = { N: 1, kN: 1e3, MN: 1e6, lbf: 4.4482216152605, kip: 4448.2216152605 }
const TIMES: Record<TimeUnit, number> = { s: 1 }
export const LENGTH_UNITS = Object.keys(LENGTHS) as LengthUnit[]
export const FORCE_UNITS = Object.keys(FORCES) as ForceUnit[]

/** Categories a value can belong to. `none` is dimensionless. */
export const CATEGORIES = {
  length: { label: 'Length', dim: { L: 1, F: 0, T: 0 } },
  area: { label: 'Area', dim: { L: 2, F: 0, T: 0 } },
  volume: { label: 'Section modulus (L³)', dim: { L: 3, F: 0, T: 0 } },
  inertia: { label: 'Moment of inertia (L⁴)', dim: { L: 4, F: 0, T: 0 } },
  force: { label: 'Force', dim: { L: 0, F: 1, T: 0 } },
  moment: { label: 'Moment', dim: { L: 1, F: 1, T: 0 } },
  forcePerLength: { label: 'Force / length (line load, stiffness)', dim: { L: -1, F: 1, T: 0 } },
  stress: { label: 'Stress, pressure', dim: { L: -2, F: 1, T: 0 } },
  unitWeight: { label: 'Unit weight', dim: { L: -3, F: 1, T: 0 } },
  mass: { label: 'Mass', dim: { L: -1, F: 1, T: 2 } },
  massPerLength: { label: 'Mass / length', dim: { L: -2, F: 1, T: 2 } },
  density: { label: 'Mass density', dim: { L: -4, F: 1, T: 2 } },
  massInertia: { label: 'Rotational mass', dim: { L: 1, F: 1, T: 2 } },
  time: { label: 'Time', dim: { L: 0, F: 0, T: 1 } },
  velocity: { label: 'Velocity', dim: { L: 1, F: 0, T: -1 } },
  acceleration: { label: 'Acceleration', dim: { L: 1, F: 0, T: -2 } },
} as const satisfies Record<string, { label: string; dim: Dim }>
export type Category = keyof typeof CATEGORIES
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[]

/** Categories whose unit is picked directly; the rest are built from the displayed length, force and time unless set explicitly. */
export const PRIMARY: readonly Category[] = ['length', 'force', 'time']

export interface Unit { sym: string; dim: Dim; /** SI value of one of these. */ si: number }

const SUPER: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const sup = (n: number) => (n === 1 ? '' : String(n).split('').map((c) => SUPER[c] ?? c).join(''))

/** `kip·s²/in`-style symbol for a unit built from the three named units. */
function compoundSymbol(dim: Dim, l: string, f: string, t: string): string {
  const parts: [string, number][] = [[f, dim.F], [l, dim.L], [t, dim.T]]
  const num = parts.filter(([, e]) => e > 0).map(([u, e]) => u + sup(e))
  const den = parts.filter(([, e]) => e < 0).map(([u, e]) => u + sup(-e))
  const top = num.join('·') || '1'
  return den.length ? `${top}/${den.join('·')}` : top
}

const sameDim = (a: Dim, b: Dim) => a.L === b.L && a.F === b.F && a.T === b.T
const siOf = (dim: Dim, l: number, f: number, t: number) => l ** dim.L * f ** dim.F * t ** dim.T

/** Named units that are not just a product of the three (ksi, MPa, tonne, ...). */
const ALIASES: Unit[] = [
  { sym: 'Pa', dim: CATEGORIES.stress.dim, si: 1 }, { sym: 'kPa', dim: CATEGORIES.stress.dim, si: 1e3 }, { sym: 'MPa', dim: CATEGORIES.stress.dim, si: 1e6 }, { sym: 'GPa', dim: CATEGORIES.stress.dim, si: 1e9 },
  { sym: 'psf', dim: CATEGORIES.stress.dim, si: 4.4482216152605 / 0.09290304 }, { sym: 'psi', dim: CATEGORIES.stress.dim, si: 4.4482216152605 / 0.0254 ** 2 },
  { sym: 'ksf', dim: CATEGORIES.stress.dim, si: 4448.2216152605 / 0.09290304 }, { sym: 'ksi', dim: CATEGORIES.stress.dim, si: 4448.2216152605 / 0.0254 ** 2 },
  { sym: 'kg', dim: CATEGORIES.mass.dim, si: 1 }, { sym: 't', dim: CATEGORIES.mass.dim, si: 1e3 }, { sym: 'lbm', dim: CATEGORIES.mass.dim, si: 0.45359237 }, { sym: 'slug', dim: CATEGORIES.mass.dim, si: 14.593902937206 },
  { sym: 'kg/m', dim: CATEGORIES.massPerLength.dim, si: 1 }, { sym: 't/m', dim: CATEGORIES.massPerLength.dim, si: 1e3 },
  { sym: 'kg/m³', dim: CATEGORIES.density.dim, si: 1 }, { sym: 't/m³', dim: CATEGORIES.density.dim, si: 1e3 },
  { sym: 'ms', dim: CATEGORIES.time.dim, si: 1e-3 },
  { sym: 'm/s²', dim: CATEGORIES.acceleration.dim, si: 1 }, { sym: 'g', dim: CATEGORIES.acceleration.dim, si: 9.80665 },
]

const PLAIN: Record<'length' | 'force' | 'time', Unit[]> = {
  length: LENGTH_UNITS.map((sym) => ({ sym, dim: CATEGORIES.length.dim, si: LENGTHS[sym] })),
  force: FORCE_UNITS.map((sym) => ({ sym, dim: CATEGORIES.force.dim, si: FORCES[sym] })),
  time: [{ sym: 's', dim: CATEGORIES.time.dim, si: 1 }],
}

/** Every unit offered for a category: the plain units, then named aliases, then length × force products (at seconds). */
export function unitOptions(cat: Category): Unit[] {
  if (cat === 'length' || cat === 'force') return PLAIN[cat]
  const dim: Dim = CATEGORIES[cat].dim
  const aliases = ALIASES.filter((a) => sameDim(a.dim, dim))
  if (cat === 'time') return [...PLAIN.time, ...aliases]
  const products: Unit[] = []
  for (const l of LENGTH_UNITS) for (const f of FORCE_UNITS) {
    if (dim.L === 0 && l !== 'm') continue // a pure-force category is not repeated per length
    if (dim.F === 0 && f !== 'N') continue
    products.push({ sym: compoundSymbol(dim, l, f, 's'), dim, si: siOf(dim, LENGTHS[l], FORCES[f], 1) })
  }
  return [...aliases, ...products]
}

/** The unit a category reads as when built from a length, force and time unit: a named alias when one is exactly equal (kip/in² is ksi), else the product. */
export function derivedUnit(cat: Category, l: LengthUnit, f: ForceUnit, t: TimeUnit): Unit {
  const dim: Dim = CATEGORIES[cat].dim
  const si = siOf(dim, LENGTHS[l], FORCES[f], TIMES[t])
  if (cat === 'length') return PLAIN.length.find((u) => u.sym === l)!
  if (cat === 'force') return PLAIN.force.find((u) => u.sym === f)!
  if (cat === 'time') return PLAIN.time[0]
  const alias = ALIASES.find((a) => sameDim(a.dim, dim) && a.sym !== 'g' && Math.abs(a.si / si - 1) < 1e-9)
  return alias ?? { sym: compoundSymbol(dim, l, f, t), dim, si }
}

export const UNIT_PRESETS: { id: string; label: string; units: BaseUnits }[] = [
  { id: 'kip-in-s', label: 'kip, in, s', units: { length: 'in', force: 'kip', time: 's' } },
  { id: 'kip-ft-s', label: 'kip, ft, s', units: { length: 'ft', force: 'kip', time: 's' } },
  { id: 'lbf-in-s', label: 'lbf, in, s', units: { length: 'in', force: 'lbf', time: 's' } },
  { id: 'lbf-ft-s', label: 'lbf, ft, s', units: { length: 'ft', force: 'lbf', time: 's' } },
  { id: 'kN-m-s', label: 'kN, m, s', units: { length: 'm', force: 'kN', time: 's' } },
  { id: 'kN-mm-s', label: 'kN, mm, s', units: { length: 'mm', force: 'kN', time: 's' } },
  { id: 'N-m-s', label: 'N, m, s', units: { length: 'm', force: 'N', time: 's' } },
  { id: 'N-mm-s', label: 'N, mm, s', units: { length: 'mm', force: 'N', time: 's' } },
]
export const presetIdOf = (u: BaseUnits | undefined) => UNIT_PRESETS.find((p) => u && p.units.length === u.length && p.units.force === u.force && p.units.time === u.time)?.id
export const baseUnitsLabel = (u: BaseUnits) => `${u.force}, ${u.length}, ${u.time}`

/** A saved `units` value, checked: undefined when absent, null when present but not a valid system. */
export function parseBaseUnits(v: unknown): BaseUnits | undefined | null {
  if (v === undefined) return undefined
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  return (LENGTH_UNITS as unknown[]).includes(r.length) && (FORCE_UNITS as unknown[]).includes(r.force) && r.time === 's' ? { length: r.length as LengthUnit, force: r.force as ForceUnit, time: 's' } : null
}

/** A display choice per category, by unit symbol. A category without an entry follows the displayed length / force / time. */
export type UnitPrefs = Partial<Record<Category, string>>

/** Saved prefs, keeping only entries that name a real category and one of its units. */
export function parseUnitPrefs(v: unknown): UnitPrefs {
  if (!v || typeof v !== 'object') return {}
  return Object.fromEntries(Object.entries(v).filter(([cat, sym]) => cat in CATEGORIES && typeof sym === 'string' && unitOptions(cat as Category).some((u) => u.sym === sym)))
}

const normalize = (s: string) => s.replace(/\s+/g, '').replace(/\*/g, '·').replace(/\^(-?\d)/g, (_, d: string) => sup(Number(d)))
const same = (a: string, b: string) => normalize(a) === normalize(b)

export interface UnitContext {
  /** False when the model has no base units: nothing is labelled or converted. */
  readonly active: boolean
  readonly base: BaseUnits | undefined
  /** The unit values of this category are shown in; undefined when inactive or dimensionless. */
  unit(cat: Category | null | undefined): Unit | undefined
  /** `'ksi'`, or `''` when there is no unit to show. */
  symbol(cat: Category | null | undefined): string
  /** Base-unit number -> number in the display unit. */
  toDisplay(cat: Category | null | undefined, value: number): number
  /** Display-unit number -> base-unit number. */
  fromDisplay(cat: Category | null | undefined, value: number): number
  /** Reads `12`, `12 ft` or `4.5 kip·in` as a base-unit number. A bare number is in the display unit. Null when it does not parse or the unit is of another dimension. */
  parse(cat: Category | null | undefined, text: string): number | null
}

const INACTIVE: UnitContext = {
  active: false, base: undefined, unit: () => undefined, symbol: () => '', toDisplay: (_, v) => v, fromDisplay: (_, v) => v,
  parse: (_, text) => { const n = Number(text.trim()); return text.trim() !== '' && Number.isFinite(n) ? n : null },
}

/** The base unit's SI value for a dimension: what one stored 1.0 means. */
const baseSi = (dim: Dim, b: BaseUnits) => siOf(dim, LENGTHS[b.length], FORCES[b.force], TIMES[b.time])

export function makeUnitContext(base: BaseUnits | undefined, prefs: UnitPrefs = {}): UnitContext {
  if (!base) return INACTIVE
  const cache = new Map<Category, Unit>()
  const choose = (cat: Category): Unit => {
    let u = cache.get(cat)
    if (u) return u
    const picked = prefs[cat] ? unitOptions(cat).find((o) => same(o.sym, prefs[cat]!)) : undefined
    if (picked) u = picked
    else {
      const l = (PLAIN.length.find((x) => x.sym === prefs.length)?.sym ?? base.length) as LengthUnit
      const f = (PLAIN.force.find((x) => x.sym === prefs.force)?.sym ?? base.force) as ForceUnit
      u = derivedUnit(cat, l, f, base.time)
    }
    cache.set(cat, u)
    return u
  }
  const factor = (cat: Category) => choose(cat).si / baseSi(CATEGORIES[cat].dim, base)
  const ok = (cat: Category | null | undefined): cat is Category => !!cat && cat in CATEGORIES
  return {
    active: true, base,
    unit: (cat) => (ok(cat) ? choose(cat) : undefined),
    symbol: (cat) => (ok(cat) ? choose(cat).sym : ''),
    toDisplay: (cat, v) => (ok(cat) ? v / factor(cat) : v),
    fromDisplay: (cat, v) => (ok(cat) ? v * factor(cat) : v),
    parse: (cat, text) => {
      const m = text.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/)
      if (!m) return null
      const n = Number(m[1])
      if (!Number.isFinite(n)) return null
      if (!ok(cat)) return m[2] ? null : n
      if (!m[2]) return n * factor(cat) // a bare number is in the display unit
      const unit = unitOptions(cat).find((o) => same(o.sym, m[2]))
      return unit ? n * unit.si / baseSi(CATEGORIES[cat].dim, base) : null
    },
  }
}

/** Shortest text that reads back as (nearly) the same number: 12 significant digits, so converting a base value to display units and back does not show float noise. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return String(Number(value.toPrecision(12)))
}

/** The number to store after the user typed `displayValue` in a unit: snapped to 12 significant digits so `0.3 m` in mm is 300, not 300.00000000000006. */
export const snapQuantity = (value: number) => Number(value.toPrecision(12))
