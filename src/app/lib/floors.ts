import type { ElementEntity, Model } from '@/app/types/model'
import type { LoadAssignment } from '@/app/types/model'
import { isStudWall, type FloorLoadArgs } from '@/app/lib/studWalls'
import { gradeE, lumberScale, sizeOf } from '@/app/lib/lumber'

/**
 * A joist floor (Carapace-only, `joistFloor` element): a plan polygon through its nodes (any shape, at one level) framed by joists in one
 * direction at a fixed spacing. It has no stiffness; it carries gravity one way to the stud walls it bears on (Carapace's floor transfer,
 * hand-calculation reactions). The joists run in their direction over the whole outline whatever its shape: each joist line is a strip
 * of tributary width `spacing`, spanning from edge to edge of the polygon (several pieces where the outline is concave), bearing on every
 * stud wall below that crosses it at right angles.
 */
export interface JoistFloorArgs {
  label?: string
  /** Joist direction in plan, degrees from +X. */
  angle: number
  /** Joist spacing (model length). */
  spacing: number
  /** Joist lumber: grade (or `custom` with `e`), size and plies (see `lib/lumber.ts`). */
  joist: { grade: string; e?: number; size: string; plies: number }
  continuity: 'simple' | 'continuous'
  /** Subfloor thickness (model length), drawn over the joists and counted in the floor depth. */
  subfloor?: number
}
/** A `floorLoad` pattern child on a joist floor: loads per unit area over the whole floor (downward positive). */
export interface FloorAreaLoadArgs { floor: number; loads: { kind: 'area'; w: number }[] }

export const isJoistFloor = (eleType: string) => eleType === 'joistFloor'
export const joistFloorArgs = (args: Record<string, unknown>) => args as unknown as JoistFloorArgs
export const isFloorAreaLoad = (child: LoadAssignment) => child.kind === 'floorLoad' && typeof child.args.floor === 'number'

type P2 = [number, number]

/** The floor's frame: joist direction `d` (s along it) and `n` across (t), and the outline in (s, t) with its elevation. */
export function floorFrame(model: Model, e: ElementEntity): { d: P2; n: P2; st: P2[]; z: number } | null {
  const a = joistFloorArgs(e.args)
  const pts = e.nodes.map((id) => model.nodes.get(id)?.coords)
  if (pts.length < 3 || pts.some((p) => !p)) return null
  const r = (a.angle * Math.PI) / 180, d: P2 = [Math.cos(r), Math.sin(r)], n: P2 = [-d[1], d[0]]
  const st = pts.map((p): P2 => [p![0] * d[0] + (p![1] ?? 0) * d[1], p![0] * n[0] + (p![1] ?? 0) * n[1]])
  return { d, n, st, z: pts.reduce((s, p) => s + (p![2] ?? 0), 0) / pts.length }
}

/** The polygon's chords along the line `t` (sorted `[s0, s1]` pieces inside it). */
export function chordsAt(st: P2[], t: number): P2[] {
  const xs: number[] = []
  for (let i = 0; i < st.length; i++) {
    const [s0, t0] = st[i], [s1, t1] = st[(i + 1) % st.length]
    if ((t0 <= t && t1 > t) || (t1 <= t && t0 > t)) xs.push(s0 + ((t - t0) / (t1 - t0)) * (s1 - s0))
  }
  xs.sort((p, q) => p - q)
  const out: P2[] = []
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0) out.push([xs[i], xs[i + 1]])
  return out
}

/** Joist strips: bands of width `spacing` across the floor from its lowest `t`, each with the chords of its centre line. */
export function floorStrips(st: P2[], spacing: number): { t0: number; t1: number; chords: P2[] }[] {
  const ts = st.map((p) => p[1]), lo = Math.min(...ts), hi = Math.max(...ts)
  if (!(spacing > 0) || !(hi > lo)) return []
  const out: { t0: number; t1: number; chords: P2[] }[] = []
  for (let t0 = lo; t0 < hi - 1e-9 * (hi - lo); t0 += spacing) {
    const t1 = Math.min(t0 + spacing, hi)
    out.push({ t0, t1, chords: chordsAt(st, (t0 + t1) / 2) })
  }
  return out
}

/** A stud wall the floor can bear on: its top line, perpendicular to the joists, at the floor's level. */
interface Bearing { wall: number; s: number; ta: number; tb: number; L: number; sign: 1 | -1 }
function bearings(model: Model, f: NonNullable<ReturnType<typeof floorFrame>>, tol: number): Bearing[] {
  const out: Bearing[] = []
  for (const w of model.elements.values()) {
    if (!isStudWall(w.eleType)) continue
    const a = model.nodes.get(w.nodes[3])?.coords, b = model.nodes.get(w.nodes[2])?.coords // top start, top end
    if (!a || !b || Math.abs((a[2] ?? 0) - f.z) > tol || Math.abs((b[2] ?? 0) - f.z) > tol) continue
    const dx = b[0] - a[0], dy = (b[1] ?? 0) - (a[1] ?? 0), L = Math.hypot(dx, dy)
    if (!(L > 0)) continue
    const along = (dx * f.d[0] + dy * f.d[1]) / L, across = (dx * f.n[0] + dy * f.n[1]) / L
    if (Math.abs(along) > 1e-3) continue // a wall parallel (or skew) to the joists carries none of them
    const s = a[0] * f.d[0] + (a[1] ?? 0) * f.d[1], ta = a[0] * f.n[0] + (a[1] ?? 0) * f.n[1]
    out.push({ wall: w.id, s, ta, tb: ta + across * L, L, sign: across > 0 ? 1 : -1 })
  }
  return out
}

export interface FloorTransfer { rows: FloorLoadArgs[]; problems: string[] }

/**
 * A floor load as Carapace floor-transfer rows: one per joist strip piece, its bounds the strip, its supports the bearing walls the
 * strip's centre line crosses inside the piece (each loaded over the strip's width, kept within the wall), its loads the floor's.
 * Strips with fewer than two bearings can't span and are reported (a cantilever past the last wall is fine: it bears on two).
 */
export function floorTransferRows(model: Model, floorId: number, loads: FloorAreaLoadArgs['loads']): FloorTransfer {
  const e = model.elements.get(floorId)
  const problems: string[] = []
  if (!e || !isJoistFloor(e.eleType)) return { rows: [], problems: [`floor ${floorId} is not a joist floor`] }
  const a = joistFloorArgs(e.args), f = floorFrame(model, e)
  if (!f) return { rows: [], problems: [`floor ${floorId} has fewer than three nodes`] }
  const ss = f.st.map((p) => p[0]), size = Math.max(Math.max(...ss) - Math.min(...ss), ...f.st.map((p) => Math.abs(p[1])), 1)
  const tol = 1e-6 * size
  const walls = bearings(model, f, Math.max(tol, 1e-6 * Math.abs(f.z)))
  const rows: FloorLoadArgs[] = []
  let unsupported = 0, short = 0
  for (const strip of floorStrips(f.st, a.spacing)) {
    const tc = (strip.t0 + strip.t1) / 2, w = strip.t1 - strip.t0
    for (const [s0, s1] of strip.chords) {
      // A wall shorter than the strip can't take its full width (Carapace splits strips where supports end); it is left out and reported.
      const crossing = walls.filter((b) => b.s >= s0 - tol && b.s <= s1 + tol && tc >= Math.min(b.ta, b.tb) - tol && tc <= Math.max(b.ta, b.tb) + tol)
      const on = crossing.filter((b) => b.L >= w - tol)
      short += crossing.length - on.length
      if (new Set(on.map((b) => b.s.toFixed(6))).size < 2) { unsupported++; continue }
      const supports = on.map((b) => {
        // Wall-local x of the strip's start, shifted so the strip's width stays on the wall.
        const x0 = Math.min(Math.max((tc - b.ta) * b.sign - w / 2, 0), b.L - w)
        return { s: Math.min(Math.max(b.s, s0), s1), t0: strip.t0, t1: strip.t1, wall: b.wall, xAtT0: b.sign > 0 ? x0 : x0 + w, reversed: b.sign < 0 }
      })
      rows.push({ bounds: [s0, s1, strip.t0, strip.t1], continuity: a.continuity, loads: loads.map((l) => ({ kind: 'area' as const, w: l.w, region: undefined })), supports })
    }
  }
  if (unsupported) problems.push(`${unsupported} joist strip${unsupported > 1 ? 's' : ''} of floor ${floorId} bear${unsupported > 1 ? '' : 's'} on fewer than two stud walls and carr${unsupported > 1 ? 'y' : 'ies'} no load to the walls`)
  if (short) problems.push(`floor ${floorId}: ${short} bearing${short > 1 ? 's' : ''} on walls shorter than the joist spacing ${short > 1 ? 'were' : 'was'} left out`)
  return { rows, problems }
}

/** The floor's transfer rows for a `floorLoad` child: a joist-floor load expands; an explicit (template) row stays as it is. */
export function floorLoadRows(model: Model, child: LoadAssignment): FloorTransfer {
  if (!isFloorAreaLoad(child)) return { rows: [child.args as unknown as FloorLoadArgs], problems: [] }
  const a = child.args as unknown as FloorAreaLoadArgs
  return floorTransferRows(model, a.floor, a.loads)
}

/** Joist depth plus subfloor, in model length units (null when the joist size is unknown). */
export function floorDepth(model: Model, a: JoistFloorArgs): number | null {
  const z = sizeOf(a.joist.size)
  if (!z) return null
  return z.d * lumberScale(model.config?.units, 2400).mm + (a.subfloor ?? 0)
}

/** Joist EI (model units) per joist, for reference in the card. */
export function joistEi(model: Model, a: JoistFloorArgs): number {
  const s = lumberScale(model.config?.units, 2400), z = sizeOf(a.joist.size)
  return z ? a.joist.plies * gradeE(a.joist.grade, a.joist.e, s) * z.b * s.mm * (z.d * s.mm) ** 3 / 12 : NaN
}

/**
 * Reactions (force per unit width) of one joist strip piece over [s0, s1] under a uniform load `w`, on rigid supports at `levels` (sorted,
 * distinct): overhangs past the end supports load them as cantilevers. `continuous` solves the three-moment equations (constant EI);
 * `simple` keeps only the overhang moments, so each span shares its load by statics and a cantilever relieves its back span.
 */
export function stripReactions(levels: number[], s0: number, s1: number, w: number, continuous: boolean): number[] {
  const n = levels.length
  if (n < 2) return levels.map(() => NaN)
  const L = levels.slice(1).map((x, i) => x - levels[i])
  const M = new Array<number>(n).fill(0) // support moments, sagging positive
  M[0] = -w * Math.max(0, levels[0] - s0) ** 2 / 2
  M[n - 1] = -w * Math.max(0, s1 - levels[n - 1]) ** 2 / 2
  if (continuous && n > 2) {
    // M[i-1] L[i-1] + 2 M[i] (L[i-1] + L[i]) + M[i+1] L[i] = -w (L[i-1]^3 + L[i]^3) / 4 for the interior supports (tridiagonal).
    const m = n - 2, a: number[] = [], b: number[] = [], c: number[] = [], d: number[] = []
    for (let k = 0; k < m; k++) {
      const i = k + 1
      a.push(L[i - 1]); b.push(2 * (L[i - 1] + L[i])); c.push(L[i])
      d.push(-w * (L[i - 1] ** 3 + L[i] ** 3) / 4 - (k === 0 ? M[0] * L[0] : 0) - (k === m - 1 ? M[n - 1] * L[n - 2] : 0))
    }
    for (let k = 1; k < m; k++) { const f = a[k] / b[k - 1]; b[k] -= f * c[k - 1]; d[k] -= f * d[k - 1] }
    for (let k = m - 1; k >= 0; k--) M[k + 1] = (d[k] - (k < m - 1 ? c[k] * M[k + 2] : 0)) / b[k]
  }
  const R = new Array<number>(n).fill(0)
  L.forEach((len, i) => { const shift = (M[i + 1] - M[i]) / len; R[i] += (w * len) / 2 + shift; R[i + 1] += (w * len) / 2 - shift })
  R[0] += w * Math.max(0, levels[0] - s0)
  R[n - 1] += w * Math.max(0, s1 - levels[n - 1])
  return R
}

/** Each bearing wall's total reaction (force, downward positive) from a floor's area loads, per pattern: Σ strip reaction × strip width,
 * walls at one support line sharing it equally. */
export function floorTakedown(model: Model, floorId: number, loads: Map<number, number>): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>()
  const e = model.elements.get(floorId)
  if (!e) return out
  const continuous = joistFloorArgs(e.args).continuity === 'continuous'
  const { rows } = floorTransferRows(model, floorId, [{ kind: 'area', w: 1 }])
  for (const r of rows) {
    const levels = [...new Set(r.supports.map((s) => s.s))].sort((p, q) => p - q)
    const unit = stripReactions(levels, r.bounds[0], r.bounds[1], 1, continuous)
    const width = r.bounds[3] - r.bounds[2]
    levels.forEach((lv, i) => {
      const at = r.supports.filter((s) => s.s === lv)
      for (const s of at) for (const [pattern, w] of loads) {
        const m = out.get(s.wall) ?? new Map<number, number>()
        m.set(pattern, (m.get(pattern) ?? 0) + (w * unit[i] * width) / at.length)
        out.set(s.wall, m)
      }
    })
  }
  return out
}

/** Joist lines for drawing: one at every spacing across the floor from its lowest edge (and one at the far edge), each piece of it
 * inside the outline as plan end points, with the floor's frame. */
export function floorJoists(model: Model, e: ElementEntity): { lines: [P2, P2][]; d: P2; n: P2; z: number } | null {
  const a = joistFloorArgs(e.args), f = floorFrame(model, e)
  if (!f || !(a.spacing > 0)) return null
  const ts = f.st.map((p) => p[1]), lo = Math.min(...ts), hi = Math.max(...ts), eps = 1e-7 * Math.max(hi - lo, 1)
  const at = (s: number, t: number): P2 => [s * f.d[0] + t * f.n[0], s * f.d[1] + t * f.n[1]]
  const lines: [P2, P2][] = []
  const count = Math.floor((hi - lo) / a.spacing + 1e-9)
  for (let k = 0; k <= count + 1; k++) {
    const t = k > count ? hi : lo + k * a.spacing
    if (k > count && hi - (lo + count * a.spacing) < a.spacing * 0.25) continue // the last regular joist is already at the edge
    for (const [s0, s1] of chordsAt(f.st, Math.min(Math.max(t, lo + eps), hi - eps))) lines.push([at(s0, t), at(s1, t)])
  }
  return { lines, d: f.d, n: f.n, z: f.z }
}

/** A floor's framing for the extruded view, in its own frame (s along the joists, t across, z up): joist and rim boxes, and the
 * subfloor slab over the outline. Joists sit under the subfloor, `plies × b` wide, the joist size deep; a rim runs inside every outline
 * edge that no stud wall carries (a wall's floor zone draws its own rim). */
export function floorFramingBoxes(model: Model, e: ElementEntity): { d: P2; n: P2; boxes: { part: 'joist' | 'rim'; s0: number; s1: number; t0: number; t1: number; z0: number; z1: number }[]; slab: { outline: P2[]; z0: number; z1: number } } | null {
  const a = joistFloorArgs(e.args), f = floorFrame(model, e), j = floorJoists(model, e), z = sizeOf(a.joist.size)
  if (!f || !j || !z) return null
  const mm = lumberScale(model.config?.units, 2400).mm, sub = a.subfloor ?? 0
  const top = f.z - sub, bottom = top - z.d * mm, width = z.b * mm * a.joist.plies, rim = 38 * mm
  const st = (p: P2): P2 => [p[0] * f.d[0] + p[1] * f.d[1], p[0] * f.n[0] + p[1] * f.n[1]]
  const boxes: NonNullable<ReturnType<typeof floorFramingBoxes>>['boxes'] = []
  for (const [p, q] of j.lines) {
    const [s0, t] = st(p), [s1] = st(q)
    boxes.push({ part: 'joist', s0: Math.min(s0, s1), s1: Math.max(s0, s1), t0: t - width / 2, t1: t + width / 2, z0: bottom, z1: top })
  }
  // Rims: along edges no wall top carries, inset into the floor (counter-clockwise outline: inside is to the left).
  const area = f.st.reduce((s, p, i) => { const q = f.st[(i + 1) % f.st.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
  const tol = 1e-6 * Math.max(...f.st.map((p) => Math.hypot(...p)), 1)
  const tops: [number[], number[]][] = [...model.elements.values()].filter((w) => isStudWall(w.eleType)).flatMap((w) => {
    const a3 = model.nodes.get(w.nodes[3])?.coords, a2 = model.nodes.get(w.nodes[2])?.coords
    return a3 && a2 && Math.abs((a3[2] ?? 0) - f.z) <= tol + 1e-6 * Math.abs(f.z) ? [[a3, a2] as [number[], number[]]] : []
  })
  // An edge is carried by a wall that runs along it (parallel) through its midpoint; a wall crossing it doesn't count.
  const onWall = (x: number, y: number, ex: number, ey: number) => tops.some(([u, v]) => {
    const dx = v[0] - u[0], dy = v[1] - u[1], L2 = dx * dx + dy * dy, r = ((x - u[0]) * dx + (y - u[1]) * dy) / (L2 || 1)
    if (Math.abs(ex * dy - ey * dx) > 1e-3 * Math.hypot(ex, ey) * Math.sqrt(L2)) return false
    return r >= -1e-9 && r <= 1 + 1e-9 && Math.hypot(u[0] + r * dx - x, u[1] + r * dy - y) <= Math.max(tol, rim / 2)
  })
  const pts = e.nodes.map((id) => model.nodes.get(id)!.coords)
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    if (onWall((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, q[0] - p[0], q[1] - p[1])) return
    const [s0, t0] = f.st[i], [s1, t1] = f.st[(i + 1) % f.st.length], len = Math.hypot(s1 - s0, t1 - t0)
    if (!(len > 0)) return
    // An edge's rim as a box in its own direction: stored as s/t extents of an edge-aligned frame is not possible here, so axis-aligned
    // edges (along s or along t) get a rim; skew edges are left open.
    const inward = Math.sign(area) || 1
    if (Math.abs(t1 - t0) <= tol) boxes.push({ part: 'rim', s0: Math.min(s0, s1), s1: Math.max(s0, s1), t0: inward * (s1 - s0) > 0 ? t0 : t0 - rim, t1: inward * (s1 - s0) > 0 ? t0 + rim : t0, z0: bottom, z1: top })
    else if (Math.abs(s1 - s0) <= tol) boxes.push({ part: 'rim', s0: inward * (t1 - t0) > 0 ? s0 - rim : s0, s1: inward * (t1 - t0) > 0 ? s0 : s0 + rim, t0: Math.min(t0, t1), t1: Math.max(t0, t1), z0: bottom, z1: top })
  })
  return { d: f.d, n: f.n, boxes, slab: { outline: pts.map((p) => [p[0], p[1]] as P2), z0: top, z1: f.z } }
}
