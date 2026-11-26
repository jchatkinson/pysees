import type { WallLayoutSpec } from '@/app/carapace/wasm/carapace_wasm'
import type { LengthUnit } from '@/app/lib/units/units'
import { sizeOf, type WallFraming } from '@/app/lib/lumber'

/**
 * A stud wall's framing as boxes for the extruded view, sized from the wall's lumber (`framing`: stud and header sizes, plies, rim,
 * window sills). Without it the sizes are nominal (38×140 mm studs, a 235 mm header, a sill at a third of the height) and posts and jacks
 * take as many plies as their EA is multiples of the typical stud's. Sheathing is 11 mm and the subfloor 19 mm, in the model's length unit.
 */
export type FramingPart = 'stud' | 'plate' | 'header' | 'rim' | 'subfloor' | 'sheathing'
/** Wall-local box: x along the wall (0..L), y up from the bottom (0..H), z through the thickness (0 = centre plane, +z = sheathed face). */
export interface FramingBox { part: FramingPart; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; /** The recorded framing member it draws (`WallMemberForce`): kind and position. */ member?: { kind: 'stud' | 'jack' | 'cripple'; x: number } }

const MM: Record<LengthUnit, number> = { mm: 1, cm: 0.1, m: 1e-3, in: 1 / 25.4, ft: 1 / 304.8 }

/** The length unit to size lumber in: the model's, or for a unitless model a guess from the wall height (2.4–3 m walls). */
export function framingUnit(unit: LengthUnit | undefined, height: number): LengthUnit {
  if (unit) return unit
  return height >= 500 ? 'mm' : height >= 30 ? 'in' : height >= 6 ? 'ft' : 'm'
}

/** Plies of a member whose EA is `ea`, counted against a single stud's. */
const plies = (ea: number, single: number) => Math.min(4, Math.max(1, Math.round(ea / single) || 1))

/**
 * Boxes for one wall of length `L` whose top row sits at `H` (above the framing height when it has a floor zone). Panel seams every
 * 1220 mm leave a small gap in the sheathing.
 */
export function wallFraming(layout: WallLayoutSpec, L: number, H: number, unit: LengthUnit, framing?: WallFraming): FramingBox[] {
  const k = MM[unit], stud = framing && sizeOf(framing.stud), b = (stud?.b ?? 38) * k, d = (stud?.d ?? 140) * k, t = d / 2, gap = 3 * k
  const Hf = Math.min(layout.height, H), plateTop = Hf - (framing?.topPlies ?? 2) * b, base = (framing?.bottomPlies ?? 1) * b
  const out: FramingBox[] = []
  const box = (part: FramingPart, x0: number, x1: number, y0: number, y1: number, z0 = -t, z1 = t, member?: FramingBox['member']) => { if (x1 - x0 > 1e-9 && y1 - y0 > 1e-9) out.push({ part, x0, x1, y0, y1, z0, z1, ...(member ? { member } : {}) }) }
  const eas = layout.studs.map((s) => s.ea).sort((p, q) => p - q), single = eas[Math.floor(eas.length / 2)] || 1
  // Openings in order along the wall, each with its framing (by its index in the layout).
  const openings = (layout.openings ?? []).map((o, i) => ({ ...o, f: framing?.openings[i] })).sort((p, q) => p.x0 - q.x0)
  type Op = (typeof openings)[number]
  // Members packed from x outward-in: a post at the wall's start grows into the wall, one at its end back into it, others centred.
  const span = (x: number, w: number): [number, number] => {
    const a = Math.min(Math.max(x - w / 2, 0), L - w)
    return [Math.max(a, 0), Math.min(a + w, L)]
  }
  const L0 = 1e-9 * L
  const inside = (x: number) => openings.find((o) => x > o.x0 + 1e-9 && x < o.x1 - 1e-9)
  const jacks = (o: Op) => (o.f?.jackPlies ?? plies(o.jackEa, single)) * b
  const sill = (o: Op) => o.door ? 0 : Math.max(base + b, o.f?.sill ?? Math.min(layout.height / 3, o.headHeight / 2))
  const header = (o: Op) => Math.min(o.headHeight + (sizeOf(o.f?.header ?? '')?.d ?? 235) * k, plateTop)
  const posts = (x: number, ea: number) => (framing ? (x <= L0 || x >= L - L0 ? framing.endPlies : 1) : plies(ea, single))

  // Plates: bottom (cut across doors between the jacks) and top, as many plies as the framing has.
  let from = 0
  for (const o of openings) if (o.door) { box('plate', from, o.x0 + b / 2 + jacks(o), 0, base); from = o.x1 - b / 2 - jacks(o) }
  box('plate', from, L, 0, base)
  for (let y = plateTop; y < Hf - 1e-9; y += b) box('plate', 0, L, y, Math.min(y + b, Hf))

  for (const s of layout.studs) {
    const o = inside(s.x)
    if (!o) { const [a, c] = span(s.x, posts(s.x, s.ea) * b); box('stud', a, c, base, plateTop, -t, t, { kind: 'stud', x: s.x }); continue }
    const [a, c] = span(s.x, b) // cripples above the header (recorded) and below the sill (not modelled in Carapace)
    box('stud', a, c, header(o), plateTop, -t, t, { kind: 'cripple', x: s.x })
    if (!o.door) box('stud', a, c, base, sill(o) - b)
  }
  for (const o of openings) {
    const j = jacks(o), a = o.x0 + b / 2, c = o.x1 - b / 2
    box('stud', a, a + j, base, o.headHeight, -t, t, { kind: 'jack', x: o.x0 }); box('stud', c - j, c, base, o.headHeight, -t, t, { kind: 'jack', x: o.x1 })
    box('header', a, c, o.headHeight, header(o))
    if (!o.door) box('plate', a + j, c - j, sill(o) - b, sill(o))
  }

  // Floor zone: a rim board flush with the sheathed face, under the subfloor.
  if (layout.floor && H > Hf + 1e-9) {
    const sub = Math.min(19 * k, (H - Hf) / 2), rim = ((framing?.rim && sizeOf(framing.rim.size)?.b) ?? 38) * k * (framing?.rim?.plies ?? 1)
    box('rim', 0, L, Hf, H - sub, t - rim, t)
    box('subfloor', 0, L, H - sub, H)
  }

  // Sheathing on the +z face, plate to plate, with the rough openings cut out and a gap at every panel seam.
  if (layout.sheathing) {
    const panel = 1220 * k, xs = new Set([0, L])
    for (let x = panel; x < L - 1e-9; x += panel) xs.add(x)
    for (const o of openings) { xs.add(o.x0 + b / 2 + jacks(o)); xs.add(o.x1 - b / 2 - jacks(o)) }
    const cuts = [...xs].filter((x) => x >= 0 && x <= L).sort((p, q) => p - q)
    const seam = (x: number) => x > 1e-9 && x < L - 1e-9 && Math.abs(x / panel - Math.round(x / panel)) < 1e-6 ? gap / 2 : 0
    for (let i = 0; i + 1 < cuts.length; i++) {
      const x0 = cuts[i] + seam(cuts[i]), x1 = cuts[i + 1] - seam(cuts[i + 1]), mid = (cuts[i] + cuts[i + 1]) / 2
      const o = openings.find((p) => mid > p.x0 + b / 2 + jacks(p) && mid < p.x1 - b / 2 - jacks(p))
      if (!o) { box('sheathing', x0, x1, 0, Hf, t, t + 11 * k); continue }
      box('sheathing', x0, x1, 0, sill(o), t, t + 11 * k)
      box('sheathing', x0, x1, o.headHeight, Hf, t, t + 11 * k)
    }
  }
  return out
}
