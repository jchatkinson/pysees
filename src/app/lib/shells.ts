import type { Vec3 } from '@/app/lib/memberFrame'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a }

/** The element-load forms the load form offers (`loadType`): a beam's uniform load, a shell pressure, a shell self-weight. */
export const ELE_LOAD_TYPES = ['Beam uniform', 'Shell pressure', 'Shell self-weight'] as const

/** The three `eleLoad` forms an element load can take. A pattern child carries `pressure` (shells), `bx/by/bz` (shell self-weight) or `wx/wy/wz` (beams). */
export type EleLoadKind = 'beam' | 'pressure' | 'selfWeight'
export const eleLoadKind = (args: Record<string, unknown>): EleLoadKind => (typeof args.pressure === 'number' ? 'pressure' : typeof args.bx === 'number' ? 'selfWeight' : 'beam')

/** A shell's local axes: e1 from the edge midpoints, e2 its completion, e3 = e1 × e2, as Carapace and OpenSees' `ShellMITC4` define them (a triangle uses its first edge). */
export function shellFrame(xyz: Vec3[]): { e1: Vec3; e2: Vec3; e3: Vec3 } | null {
  if (xyz.length < 3) return null
  let v1: Vec3, v2: Vec3
  if (xyz.length === 4) {
    const [p0, p1, p2, p3] = xyz
    v1 = [0, 1, 2].map((k) => 0.5 * (p2[k] + p1[k] - p3[k] - p0[k])) as Vec3
    v2 = [0, 1, 2].map((k) => 0.5 * (p3[k] + p2[k] - p1[k] - p0[k])) as Vec3
  } else {
    v1 = sub(xyz[1], xyz[0])
    v2 = sub(xyz[2], xyz[0])
  }
  const l1 = Math.hypot(...v1)
  if (!(l1 > 0)) return null
  const e1 = unit(v1)
  const a = dot(v2, e1)
  const r: Vec3 = [v2[0] - a * e1[0], v2[1] - a * e1[1], v2[2] - a * e1[2]]
  if (!(Math.hypot(...r) > 0)) return null
  const e2 = unit(r)
  return { e1, e2, e3: cross(e1, e2) }
}

/** The shell's normal and its tributary area per node, `∫N_i dA`. For a quad this is OpenSees' 2×2 Gauss integral of the bilinear shape functions over the projected element (exact), for a triangle area/3. */
export function shellNodalAreas(xyz: Vec3[]): { normal: Vec3; areas: number[] } | null {
  const frame = shellFrame(xyz)
  if (!frame) return null
  const xl = xyz.map((p) => [dot(p, frame.e1), dot(p, frame.e2)])
  if (xyz.length === 3) {
    const area = 0.5 * ((xl[1][0] - xl[0][0]) * (xl[2][1] - xl[0][1]) - (xl[2][0] - xl[0][0]) * (xl[1][1] - xl[0][1]))
    return { normal: frame.e3, areas: [area / 3, area / 3, area / 3] }
  }
  const g = 1 / Math.sqrt(3)
  const gauss: [number, number][] = [[-g, -g], [g, -g], [g, g], [-g, g]]
  const sc = [-0.5, 0.5, 0.5, -0.5], tc = [-0.5, -0.5, 0.5, 0.5]
  const areas = [0, 0, 0, 0]
  for (const [s, t] of gauss) {
    const n = sc.map((si, i) => (0.5 + si * s) * (0.5 + tc[i] * t))
    const ds = sc.map((si, i) => si * (0.5 + tc[i] * t)), dt = tc.map((ti, i) => ti * (0.5 + sc[i] * s))
    const j00 = xl.reduce((acc, p, i) => acc + p[0] * ds[i], 0), j01 = xl.reduce((acc, p, i) => acc + p[0] * dt[i], 0)
    const j10 = xl.reduce((acc, p, i) => acc + p[1] * ds[i], 0), j11 = xl.reduce((acc, p, i) => acc + p[1] * dt[i], 0)
    const det = j00 * j11 - j01 * j10
    n.forEach((ni, i) => { areas[i] += ni * det })
  }
  return { normal: frame.e3, areas }
}
