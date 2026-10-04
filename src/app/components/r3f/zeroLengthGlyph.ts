import { readOrient } from '@/app/lib/orient'

export type Vec3 = [number, number, number]
/** Local frame axes (x, y, z) expressed in global coordinates. */
export type Frame = [Vec3, Vec3, Vec3]

const IDENTITY: Frame = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const unit = (a: Vec3): Vec3 => scale(a, 1 / len(a))

/**
 * OpenSees `-orient`: 3D `x1 x2 x3 yp1 yp2 yp3` (local x is `x`, local z is `x × yp`, local y completes the set), or the
 * 2D form `x1 x2 x3`, where local y is x turned 90° counter-clockwise (yp = (-x2, x1, 0)).
 * Anything malformed (missing, wrong length, zero or parallel vectors) falls back to the global axes.
 */
export function orientFrame(orient: unknown): Frame {
  const n = readOrient(orient)
  if (!n) return IDENTITY
  const x: Vec3 = [n[0], n[1], n[2]]
  const yp: Vec3 = n.length === 3 ? [-n[1], n[0], 0] : [n[3], n[4], n[5]]
  const zRaw = cross(x, yp)
  if (len(x) < 1e-9 || len(zRaw) < 1e-9) return IDENTITY
  const ex = unit(x)
  const ez = unit(zRaw)
  return [ex, cross(ez, ex), ez]
}

/**
 * 1-based DOFs a zero-length element couples. `zeroLengthSection` is driven by its fiber section
 * (axial + moment: `[ux, rz]` in 2D, `[ux, ry, rz]` in 3D); a `zeroLength` lists them in `args.dir`.
 */
export function coupledDofs(eleType: string, args: Record<string, unknown>, ndm: 2 | 3): number[] {
  if (eleType === 'zeroLengthSection') return ndm === 2 ? [1, 3] : [1, 5, 6]
  if (eleType === 'zeroLength' && Array.isArray(args.dir)) return args.dir.map(Number).filter((d) => Number.isInteger(d) && d >= 1)
  return []
}

export function isZeroLengthType(eleType: string): boolean {
  return eleType === 'zeroLength' || eleType === 'zeroLengthSection'
}

/** Which local axis a DOF acts along/about. */
function dofAxis(dof: number, ndm: 2 | 3): { rotation: boolean; axis: 0 | 1 | 2 } | null {
  if (ndm === 2) return dof <= 2 ? { rotation: false, axis: (dof - 1) as 0 | 1 } : dof === 3 ? { rotation: true, axis: 2 } : null
  if (dof <= 3) return { rotation: false, axis: (dof - 1) as 0 | 1 | 2 }
  return dof <= 6 ? { rotation: true, axis: (dof - 4) as 0 | 1 | 2 } : null
}

const STUB_LEN = 9
const HEAD_LEN = 4
const HEAD_HALF = 2.5
const ARC_START = 0.35
const ARC_END = 1.9
const ARC_STEPS = 8

export interface Glyph {
  /** Ring points in the camera plane (pixel units); drawn as a billboard. */
  ring: Vec3[]
  /** Polylines in the element's global axes (pixel units): translation stubs and rotation arcs. */
  lines: Vec3[][]
}

/** Pixel-unit polylines for the zero-length glyph: a ring of `radius` px plus a mark per coupled DOF in `frame`. */
export function buildGlyph(dofs: number[], frame: Frame, ndm: 2 | 3, radius: number): Glyph {
  const ring: Vec3[] = []
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * Math.PI * 2
    ring.push([radius * Math.cos(t), radius * Math.sin(t), 0])
  }

  const lines: Vec3[][] = []
  for (const dof of dofs) {
    const a = dofAxis(dof, ndm)
    if (!a) continue
    const e = frame[a.axis]
    // The two frame axes perpendicular to this one: arrowhead wings (translation) / the arc's plane (rotation).
    const u = frame[(a.axis + 1) % 3]
    const v = frame[(a.axis + 2) % 3]
    if (!a.rotation) {
      for (const sign of [1, -1]) {
        const dir = scale(e, sign)
        const base = scale(dir, radius)
        const tip = scale(dir, radius + STUB_LEN)
        const back = add(tip, scale(dir, -HEAD_LEN))
        lines.push([base, tip])
        for (const wing of [u, v]) {
          lines.push([add(back, scale(wing, HEAD_HALF)), tip, add(back, scale(wing, -HEAD_HALF))])
        }
      }
    } else {
      const r = radius + 4
      const pt = (t: number): Vec3 => add(scale(u, r * Math.cos(t)), scale(v, r * Math.sin(t)))
      const arc: Vec3[] = []
      for (let i = 0; i <= ARC_STEPS; i++) arc.push(pt(ARC_START + ((ARC_END - ARC_START) * i) / ARC_STEPS))
      lines.push(arc)
      const tip = pt(ARC_END)
      const tangent = add(scale(u, -Math.sin(ARC_END)), scale(v, Math.cos(ARC_END)))
      const radial = add(scale(u, Math.cos(ARC_END)), scale(v, Math.sin(ARC_END)))
      const back = add(tip, scale(tangent, -HEAD_LEN))
      lines.push([add(back, scale(radial, HEAD_HALF)), tip, add(back, scale(radial, -HEAD_HALF))])
    }
  }
  return { ring, lines }
}
