export type Vec3 = [number, number, number]

/** A beam-column's local axes in global coordinates: x along the member (node i → j), y and z transverse. */
export interface MemberFrame { x: Vec3; y: Vec3; z: Vec3 }

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a }

/** The `vecxz` of a geomTransf's args as three finite numbers, or null if absent or malformed. */
export function readVecXz(raw: unknown): Vec3 | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null
  const v = raw.map(Number)
  return v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null
}

/**
 * Local axes of the member from `a` to `b`, or null if it has no length. 2D: y is x turned 90° counter-clockwise in the XY plane
 * and z is global Z. 3D follows OpenSees: `vecxz` lies in the local x–z plane, y = vecxz × x, z = x × y. Without a usable `vecxz`
 * (Z is up) vertical members take global X and every other member takes global Z.
 */
export function memberFrame(a: ArrayLike<number>, b: ArrayLike<number>, ndm: 2 | 3, vecxz?: unknown): MemberFrame | null {
  const x = norm([b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0)])
  if (!(Math.hypot(x[0], x[1], x[2]) > 0)) return null
  if (ndm === 2) return { x: [x[0], x[1], 0], y: [-x[1], x[0], 0], z: [0, 0, 1] }
  const vertical = Math.abs(x[2]) > 0.999
  for (const v of [readVecXz(vecxz), vertical ? [1, 0, 0] as Vec3 : [0, 0, 1] as Vec3]) {
    if (!v) continue
    const y = cross(v, x)
    if (Math.hypot(y[0], y[1], y[2]) < 1e-9) continue
    const yn = norm(y)
    return { x, y: yn, z: cross(x, yn) }
  }
  return null
}
