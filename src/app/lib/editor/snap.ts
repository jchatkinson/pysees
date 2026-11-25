import type { ElementEntity, NodeEntity } from '@/app/types/model'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import { levelElevations } from '@/app/lib/levels'
import { planElevation, gridSlab, type ViewMode } from './viewSlice'
import type { P3 } from './draw'

/** Snap targets in priority order: an existing node beats a grid intersection beats a member midpoint. */
export type SnapKind = 'node' | 'grid' | 'mid'
export interface SnapPoint { p: P3; kind: SnapKind; nodeId?: number }
export type Screen = { x: number; y: number }

const PRIORITY: Record<SnapKind, number> = { node: 0, grid: 1, mid: 2 }

/** Where two plan grid lines (as infinite lines) cross, in XY; null when parallel. */
export function gridCrossing(a: GridlineEntity, b: GridlineEntity): [number, number] | null {
  const ax = a.start[0] ?? 0, ay = a.start[1] ?? 0, adx = (a.end[0] ?? 0) - ax, ady = (a.end[1] ?? 0) - ay
  const bx = b.start[0] ?? 0, by = b.start[1] ?? 0, bdx = (b.end[0] ?? 0) - bx, bdy = (b.end[1] ?? 0) - by
  const den = adx * bdy - ady * bdx
  if (Math.abs(den) < 1e-12 * (Math.hypot(adx, ady) * Math.hypot(bdx, bdy) || 1)) return null
  const t = ((bx - ax) * bdy - (by - ay) * bdx) / den
  return [ax + t * adx, ay + t * ady]
}

/** Elevations a view works at: the plan's level, or base plus every level. */
export function workElevations(mode: ViewMode, levels: LevelEntity[]): number[] {
  return mode.kind === 'plan' ? [planElevation(levels, mode.level)] : [0, ...levelElevations(levels)]
}

/** Grid intersections at the view's elevations (2D: each grid's x at each level). `keep` drops points outside the view's slice. */
export function gridPoints(grids: GridlineEntity[], elevations: number[], ndm: 2 | 3, keep: (p: P3) => boolean = () => true): P3[] {
  const out: P3[] = []
  if (ndm === 2) { for (const g of grids) for (const z of elevations) out.push([g.start[0] ?? 0, z, 0]); return out }
  const xy: [number, number][] = []
  for (let i = 0; i < grids.length; i++) for (let j = i + 1; j < grids.length; j++) { const c = gridCrossing(grids[i], grids[j]); if (c) xy.push(c) }
  for (const z of elevations) for (const [x, y] of xy) { const p: P3 = [x, y, z]; if (keep(p)) out.push(p) }
  return out
}

/** Candidate snap points: the given nodes, grid intersections and the midpoints of two-node members. */
export function snapPoints(nodes: Map<number, NodeEntity>, elements: Map<number, ElementEntity>, grid: P3[]): SnapPoint[] {
  const at = (n: NodeEntity): P3 => [n.coords[0] ?? 0, n.coords[1] ?? 0, n.coords[2] ?? 0]
  const out: SnapPoint[] = [...nodes.values()].map((n) => ({ p: at(n), kind: 'node' as const, nodeId: n.id }))
  for (const p of grid) out.push({ p, kind: 'grid' })
  for (const e of elements.values()) {
    if (e.nodes.length !== 2) continue
    const a = nodes.get(e.nodes[0]), b = nodes.get(e.nodes[1])
    if (a && b) { const pa = at(a), pb = at(b); out.push({ p: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2], kind: 'mid' }) }
  }
  return out
}

/** The best snap within `radius` screen pixels of the cursor: highest priority first, then nearest. */
export function pickSnap(points: SnapPoint[], project: (p: P3) => Screen | null, cursor: Screen, radius: number, kinds?: SnapKind[]): SnapPoint | null {
  let best: SnapPoint | null = null, bestScore = Infinity
  for (const s of points) {
    if (kinds && !kinds.includes(s.kind)) continue
    const q = project(s.p)
    if (!q) continue
    const d = Math.hypot(q.x - cursor.x, q.y - cursor.y)
    if (d > radius) continue
    const score = PRIORITY[s.kind] * 1e6 + d
    if (score < bestScore) { best = s; bestScore = score }
  }
  return best
}

/** A straight reference line with break points (grid crossings or levels) along it, in its own parameter. */
export interface BayLine { origin: P3; dir: P3; stops: number[] }

/**
 * Lines a quick-draw tool fills bay by bay. Beams: in a plan, every grid at the plan's level, broken where other grids cross it; in an
 * elevation, every level along the grid, broken at the crossing grids (2D: along X at each level, broken at the grids). Columns:
 * vertical lines at the grid crossings in the view, broken at base and each level (elevation and 2D only; a plan places columns by point).
 */
export function bayLines(kind: 'beam' | 'column', mode: ViewMode, grids: GridlineEntity[], levels: LevelEntity[], ndm: 2 | 3): BayLine[] {
  const elev = levelElevations(levels)
  const zs = [0, ...elev]
  if (ndm === 2) {
    const xs = [...new Set(grids.map((g) => g.start[0] ?? 0))].sort((a, b) => a - b)
    if (kind === 'beam') return elev.map((y) => ({ origin: [0, y, 0], dir: [1, 0, 0], stops: xs }))
    return xs.map((x) => ({ origin: [x, 0, 0], dir: [0, 1, 0], stops: zs }))
  }
  const along = (g: GridlineEntity, z: number) => {
    const sx = g.start[0] ?? 0, sy = g.start[1] ?? 0, dx = (g.end[0] ?? 0) - sx, dy = (g.end[1] ?? 0) - sy
    const len = Math.hypot(dx, dy) || 1
    const dir: P3 = [dx / len, dy / len, 0]
    const stops = grids.map((o) => (o.id === g.id ? null : gridCrossing(g, o))).filter((c): c is [number, number] => !!c)
      .map(([x, y]) => (x - sx) * dir[0] + (y - sy) * dir[1]).sort((a, b) => a - b)
    return { origin: [sx, sy, z] as P3, dir, stops }
  }
  if (mode.kind === 'plan') return kind === 'beam' ? grids.map((g) => along(g, planElevation(levels, mode.level))) : []
  if (mode.kind !== 'elevation' || mode.gridId === null) return []
  const g = grids.find((x) => x.id === mode.gridId)
  if (!g) return []
  if (kind === 'beam') return elev.map((z) => along(g, z))
  const base = along(g, 0)
  return base.stops.map((t) => ({ origin: [base.origin[0] + t * base.dir[0], base.origin[1] + t * base.dir[1], 0] as P3, dir: [0, 0, 1] as P3, stops: zs }))
}

/**
 * The bay under the cursor: the nearest line within `radius` pixels, and its stretch between the stops either side of the cursor.
 * Returns the bay's two end points, or null off every line or outside the stops.
 */
export function bayAt(lines: BayLine[], q: P3, project: (p: P3) => Screen | null, cursor: Screen, radius: number): [P3, P3] | null {
  let best: [P3, P3] | null = null, bestD = radius
  for (const l of lines) {
    const t = (q[0] - l.origin[0]) * l.dir[0] + (q[1] - l.origin[1]) * l.dir[1] + (q[2] - l.origin[2]) * l.dir[2]
    const foot: P3 = [l.origin[0] + t * l.dir[0], l.origin[1] + t * l.dir[1], l.origin[2] + t * l.dir[2]]
    const s = project(foot)
    if (!s) continue
    const d = Math.hypot(s.x - cursor.x, s.y - cursor.y)
    if (d > bestD) continue
    const i = l.stops.findIndex((v, k) => k + 1 < l.stops.length && t >= v && t <= l.stops[k + 1])
    if (i < 0) continue
    const at = (v: number): P3 => [l.origin[0] + v * l.dir[0], l.origin[1] + v * l.dir[1], l.origin[2] + v * l.dir[2]]
    best = [at(l.stops[i]), at(l.stops[i + 1])]
    bestD = d
  }
  return best
}

/** Is `p` within the slab of an elevation grid (used to keep snap points to the drawn slice)? */
export function inGridSlab(grids: GridlineEntity[], gridId: number, p: P3, eps: number): boolean {
  const slab = gridSlab(grids, gridId, eps)
  if (!slab) return true
  const off = slab.normal.x * (p[0] - slab.origin.x) + slab.normal.y * (p[1] - slab.origin.y)
  return off >= -slab.below - eps && off <= slab.above + eps
}

/**
 * The grid cell under a point, for shells: in a plan, the rectangle between the neighbouring X- and Y-parallel grids at the plan's level;
 * in a grid elevation, the panel between the crossing grids either side and the levels above and below. Corners in drawing order, or null.
 * Only axis-parallel grids bound plan cells.
 */
export function cellAt(mode: ViewMode, grids: GridlineEntity[], levels: LevelEntity[], q: P3): P3[] | null {
  const around = (vs: number[], v: number) => {
    const s = [...new Set(vs.map((x) => Number(x.toPrecision(12))))].sort((a, b) => a - b)
    const i = s.findIndex((x, k) => k + 1 < s.length && v >= x && v <= s[k + 1])
    return i < 0 ? null : [s[i], s[i + 1]] as const
  }
  if (mode.kind === 'plan') {
    const z = planElevation(levels, mode.level)
    const xs = grids.filter((g) => Math.abs((g.end[0] ?? 0) - (g.start[0] ?? 0)) < 1e-9).map((g) => g.start[0] ?? 0)
    const ys = grids.filter((g) => Math.abs((g.end[1] ?? 0) - (g.start[1] ?? 0)) < 1e-9).map((g) => g.start[1] ?? 0)
    const bx = around(xs, q[0]), by = around(ys, q[1])
    return bx && by ? [[bx[0], by[0], z], [bx[1], by[0], z], [bx[1], by[1], z], [bx[0], by[1], z]] : null
  }
  if (mode.kind !== 'elevation' || mode.gridId === null) return null
  const [line] = bayLines('beam', mode, grids, [{ id: 0, label: '', height: 0 }], 3)
  if (!line) return null
  const t = (q[0] - line.origin[0]) * line.dir[0] + (q[1] - line.origin[1]) * line.dir[1]
  const bt = around(line.stops, t), bz = around([0, ...levelElevations(levels)], q[2])
  if (!bt || !bz) return null
  const at = (s: number, z: number): P3 => [line.origin[0] + s * line.dir[0], line.origin[1] + s * line.dir[1], z]
  return [at(bt[0], bz[0]), at(bt[1], bz[0]), at(bt[1], bz[1]), at(bt[0], bz[1])]
}

/** Split a quad (corners in order) into an `nu` × `nv` grid of quads by bilinear interpolation. */
export function meshQuad(c: P3[], nu: number, nv: number): P3[][] {
  const at = (u: number, v: number): P3 => [0, 1, 2].map((k) => (1 - u) * (1 - v) * c[0][k] + u * (1 - v) * c[1][k] + u * v * c[2][k] + (1 - u) * v * c[3][k]) as P3
  const out: P3[][] = []
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) out.push([at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv)])
  return out
}
