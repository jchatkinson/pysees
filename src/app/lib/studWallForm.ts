import type { WallLayoutSpec, WallOpeningSpec } from '@/app/carapace/wasm/carapace_wasm'
import type { Category, UnitContext } from '@/app/lib/units/units'
import { applyFraming, CUSTOM, framingStiffness, type LumberScale, type Member, type OpeningFraming, type WallFraming } from '@/app/lib/lumber'

// The stud-wall layout form (StudWallCard): layout + framing ↔ text fields in display units. Members are lumber (grade, size, plies);
// an EA / EI field left blank uses the computed value, a typed one overrides it.

export const fmt = (v: number) => String(Number(v.toPrecision(6)))

type Units = UnitContext
/** An opening as its left edge (in length units, or as a fraction of the wall length when `relative`), width, head height and, for a window, opening height. */
export type OpeningText = { door: boolean; left: string; width: string; head: string; open: string; header: string; headerPlies: string; jackPlies: string; headerEi: string; jackEa: string }
export const MEMBERS: [Member, Category][] = [['studEa', 'force'], ['endEa', 'force'], ['topEa', 'force'], ['topEi', 'rigidity'], ['bottomEa', 'force'], ['bottomEi', 'rigidity'], ['rimEa', 'force']]

/** Default window sill: a third of the framing height, below the head. */
const defaultSill = (o: WallOpeningSpec, height: number) => Math.min(height / 3, o.headHeight / 2)

/** The wall's layout and framing as form text, in display units. */
export function layoutText(l: WallLayoutSpec, f: WallFraming, u: Units, relative = false) {
  const d = (cat: Category, v: number | undefined) => (v === undefined ? '' : fmt(u.toDisplay(cat, v)))
  const law = l.sheathing?.law
  const over = (m: Member, cat: Category) => (m === 'topEi' && f.over?.topEi === 0 ? 'none' : d(cat, f.over?.[m]))
  const text: Record<string, string> = {
    positions: l.studs.map((s) => d('length', s.x)).join(', '), spacing: '', topDistribution: l.topDistribution,
    grade: f.grade, e: d('stress', f.e), stud: f.stud, endPlies: String(f.endPlies), topPlies: String(f.topPlies), bottomPlies: String(f.bottomPlies),
    headerGrade: f.headerGrade, headerE: d('stress', f.headerE),
    rimSize: f.rim?.size ?? 'rim32', rimPlies: String(f.rim?.plies ?? 1), rimGrade: f.rim?.grade ?? f.grade, rimE: d('stress', f.rim?.e),
    ...Object.fromEntries(MEMBERS.map(([m, cat]) => [m, over(m, cat)])),
    law: law?.kind ?? 'linear', ga: law?.kind === 'linear' ? d('forcePerLength', law.ga) : '', bv: law?.kind === 'o86' ? d('forcePerLength', law.bv) : '',
    nailSpacing: law?.kind === 'o86' ? d('length', law.nailSpacing) : '', nailDiameter: law?.kind === 'o86' ? d('length', law.nailDiameter) : '',
    floorGa: d('forcePerLength', l.floor?.ga),
  }
  const openings: OpeningText[] = (l.openings ?? []).map((o, i) => {
    const of = f.openings[i]
    return {
      door: o.door, left: relative ? fmt(o.x0 / l.length) : d('length', o.x0), width: d('length', o.x1 - o.x0), head: d('length', o.headHeight), open: o.door ? '' : d('length', o.headHeight - (of?.sill ?? defaultSill(o, l.height))),
      header: of?.header ?? '2x10', headerPlies: String(of?.headerPlies ?? 2), jackPlies: String(of?.jackPlies ?? 1), headerEi: d('rigidity', of?.over?.headerEi), jackEa: d('force', of?.over?.jackEa),
    }
  })
  return { text, openings, relative }
}

/** A new opening's text, sized like the last one (or the wall's defaults). */
export const newOpeningText = (last: OpeningText | undefined, left: string, width: string, head: string, open: string): OpeningText =>
  last ? { ...last, left } : { door: false, left, width, head, open, header: '2x10', headerPlies: '2', jackPlies: '1', headerEi: '', jackEa: '' }

/**
 * Form text → layout and framing (model units). Studs are added at every opening edge, and every EA / EI comes from the framing.
 * A field whose text is unchanged keeps its stored value exactly (no drift through the displayed digits). Returns the field errors
 * instead when a value doesn't parse.
 */
export function parseLayout(base: WallLayoutSpec, f0: WallFraming, init: ReturnType<typeof layoutText>, text: Record<string, string>, openings: OpeningText[], u: Units, scale: LumberScale, relative = init.relative): { layout?: WallLayoutSpec; framing?: WallFraming; errors: string[] } {
  const errors: string[] = []
  const num = (cat: Category, s: string, label: string, was: string | undefined, stored: number | undefined): number => {
    if (s === was && stored !== undefined) return stored
    const v = u.parse(cat, s)
    if (v === null) { errors.push(`${label}: not a number`); return NaN }
    return v
  }
  const opt = (cat: Category, s: string, label: string, was: string | undefined, stored: number | undefined) => (s.trim() === '' ? undefined : num(cat, s, label, was, stored))
  const f = (key: string, cat: Category, label: string, stored: number | undefined) => num(cat, text[key] ?? '', label, init.text[key], stored)
  const count = (s: string, label: string) => { const n = Number(s); if (!Number.isInteger(n) || n < 1) { errors.push(`${label}: a whole number of plies, at least 1`); return 1 } return n }
  const L = base.length
  const snap = (x: number) => (Math.abs(x) <= 1e-9 * L ? 0 : Math.abs(x - L) <= 1e-9 * L ? L : x)

  // Framing: grades (a custom one needs its E), sizes, plies, overrides.
  const e = text.grade === CUSTOM ? f('e', 'stress', 'E', f0.e) : undefined
  const headerE = text.headerGrade === CUSTOM ? f('headerE', 'stress', 'Header E', f0.headerE) : undefined
  const over: Partial<Record<Member, number>> = {}
  for (const [m, cat] of MEMBERS) {
    const s = text[m] ?? ''
    if (m === 'topEi' && s.trim().toLowerCase() === 'none') { over.topEi = 0; continue }
    const v = opt(cat, s, `${m} override`, init.text[m], f0.over?.[m])
    if (v !== undefined) over[m] = v
  }
  const baseOpen = base.openings ?? []
  const ops: WallOpeningSpec[] = [], opFraming: OpeningFraming[] = []
  openings.forEach((o, i) => {
    const was = init.openings[i], b = baseOpen[i], bf = was ? f0.openings[i] : undefined
    const g = (k: 'width' | 'head', label: string, stored: number | undefined) => num('length', o[k], `Opening ${i + 1} ${label}`, was?.[k], was ? stored : undefined)
    const head = g('head', 'head', b?.headHeight)
    // The left edge (absolute or a fraction of the length) and the width; unchanged text keeps both stored edges exactly.
    const sameLeft = was !== undefined && relative === init.relative && o.left === was.left
    let x0 = sameLeft ? b.x0 : relative ? Number(o.left) * L : num('length', o.left, `Opening ${i + 1} left`, undefined, undefined)
    if (relative && !sameLeft && !(o.left.trim() !== '' && Number.isFinite(Number(o.left)))) { errors.push(`Opening ${i + 1} left: a fraction of the wall length (0–1)`); x0 = NaN }
    const x1 = sameLeft && o.width === was.width ? b.x1 : x0 + g('width', 'width', b ? b.x1 - b.x0 : undefined)
    const sill = o.door ? undefined : o.open === was?.open && o.head === was?.head && bf?.sill !== undefined ? bf.sill : head - num('length', o.open, `Opening ${i + 1} height`, undefined, undefined)
    const ov = { headerEi: opt('rigidity', o.headerEi, `Opening ${i + 1} header EI`, was?.headerEi, bf?.over?.headerEi), jackEa: opt('force', o.jackEa, `Opening ${i + 1} jack EA`, was?.jackEa, bf?.over?.jackEa) }
    ops.push({ door: o.door, x0: snap(x0), x1: snap(x1), headHeight: head, headerEi: 0, jackEa: 0 })
    opFraming.push({ header: o.header, headerPlies: count(o.headerPlies, `Opening ${i + 1} header`), jackPlies: count(o.jackPlies, `Opening ${i + 1} jacks`), ...(sill !== undefined ? { sill } : {}), ...(ov.headerEi !== undefined || ov.jackEa !== undefined ? { over: Object.fromEntries(Object.entries(ov).filter(([, v]) => v !== undefined)) } : {}) })
    if (sill !== undefined && !(sill > 0 && sill < head)) errors.push(`Opening ${i + 1}: the opening height must be positive and less than the head height.`)
  })
  const framing: WallFraming = {
    grade: text.grade, ...(e !== undefined ? { e } : {}), stud: text.stud,
    endPlies: count(text.endPlies, 'End posts'), topPlies: count(text.topPlies, 'Top plates'), bottomPlies: count(text.bottomPlies, 'Bottom plates'),
    headerGrade: text.headerGrade, ...(headerE !== undefined ? { headerE } : {}),
    ...(base.floor ? { rim: { size: text.rimSize, plies: count(text.rimPlies, 'Rim'), grade: text.rimGrade, ...(text.rimGrade === CUSTOM ? { e: f('rimE', 'stress', 'Rim E', f0.rim?.e) } : {}) } } : {}),
    openings: opFraming, ...(Object.keys(over).length ? { over } : {}),
  }

  // Geometry: stud positions (plus opening edges), sheathing, floor zone; then every stiffness from the framing.
  const wasTokens = init.text.positions.split(/[,;]/).map((t) => t.trim())
  const xs = text.positions.split(/[,;]/).map((t) => t.trim()).filter(Boolean).map((t, i) => snap(num('length', t, `Stud ${i + 1}`, wasTokens[i], base.studs[i]?.x)))
  for (const o of ops) xs.push(o.x0, o.x1)
  const positions = [...new Set(xs)].sort((a, b) => a - b).filter((x, i, s) => i === 0 || x - s[i - 1] > 1e-9 * L)
  const law0 = base.sheathing?.law
  const law = text.law === 'o86'
    ? { kind: 'o86' as const, bv: f('bv', 'forcePerLength', 'Bv', law0?.kind === 'o86' ? law0.bv : undefined), nailSpacing: f('nailSpacing', 'length', 'Nail spacing', law0?.kind === 'o86' ? law0.nailSpacing : undefined), nailDiameter: f('nailDiameter', 'length', 'Nail diameter', law0?.kind === 'o86' ? law0.nailDiameter : undefined) }
    : { kind: 'linear' as const, ga: f('ga', 'forcePerLength', 'Ga', law0?.kind === 'linear' ? law0.ga : undefined) }
  const geometry: WallLayoutSpec = {
    ...base, studs: positions.map((x) => ({ x, ea: 0 })), openings: ops, sheathing: { law }, topDistribution: text.topDistribution === 'direct' ? 'direct' : 'beam',
    ...(base.floor ? { floor: { ...base.floor, ga: f('floorGa', 'forcePerLength', 'Floor zone Ga', base.floor.ga) } } : {}),
  }
  if (errors.length) return { errors }
  const layout = applyFraming(geometry, framing, scale)
  const k = framingStiffness(framing, scale, base.floor?.depth)
  if (![k.studEa, k.endEa, k.topEa, k.bottomEa, ...k.openings.flatMap((o) => [o.jackEa, o.headerEi])].every((v) => v > 0)) errors.push('Every member needs a grade with a positive E and a size.')
  return errors.length ? { errors } : { layout, framing, errors }
}

/** An opening's left edge re-expressed when the form switches between absolute and relative positions (text unchanged when it doesn't parse). */
export function convertLeft(left: string, toRelative: boolean, L: number, u: Units): string {
  if (toRelative) { const x = u.parse('length', left); return x === null ? left : fmt(x / L) }
  const r = Number(left)
  return left.trim() === '' || !Number.isFinite(r) ? left : fmt(u.toDisplay('length', r * L))
}
