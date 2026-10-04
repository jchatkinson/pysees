/**
 * OpenSees `-orient` for zero-length elements. 2D takes `x1 x2 x3` (local x; local y is x turned 90° counter-clockwise,
 * so `x3` must be 0). 3D takes `x1 x2 x3 yp1 yp2 yp3`: local z is `x × yp`, local y is `z × x`.
 */
export type Orient = number[]

/** The global axes, spelled out — what an element without `-orient` uses. */
export const globalOrient = (ndm: number): Orient => (ndm === 2 ? [1, 0, 0] : [1, 0, 0, 0, 1, 0])

/** `args.orient` as 3 or 6 finite numbers, or null if it is absent or malformed. */
export function readOrient(raw: unknown): Orient | null {
  if (!Array.isArray(raw) || (raw.length !== 3 && raw.length !== 6)) return null
  const n = raw.map(Number)
  return n.every(Number.isFinite) ? n : null
}

/** Why `orient` can't define a local frame (the same checks Carapace's decoder makes), or null if it can. */
export function orientProblem(orient: unknown, ndm: number): string | null {
  const o = readOrient(orient)
  const want = ndm === 2 ? 3 : 6
  if (!o || o.length !== want) return ndm === 2 ? 'Orientation needs three numbers in a 2D model: x1 x2 x3.' : 'Orientation needs six numbers in a 3D model: x1 x2 x3 yp1 yp2 yp3.'
  const [x1, x2, x3, y1 = 0, y2 = 0, y3 = 0] = o
  if (Math.hypot(x1, x2, x3) === 0) return 'Orientation x vector must be non-zero.'
  if (ndm === 2) return Math.abs(x3) > 1e-9 ? 'In a 2D model the orientation vector must lie in the xy plane (x3 = 0).' : null
  const cross = Math.hypot(x2 * y3 - x3 * y2, x3 * y1 - x1 * y3, x1 * y2 - x2 * y1)
  return cross <= 1e-12 * Math.hypot(x1, x2, x3) * Math.hypot(y1, y2, y3) ? 'Orientation vectors x and yp must be non-zero and not parallel.' : null
}
