/** Screen-space rectangle selection (window / crossing), independent of three.js so it can be tested directly. */

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
export type Pt = { x: number; y: number }

/** A drag from (x1,y1) to (x2,y2): left-to-right is a window (`exclusive`), right-to-left a crossing. */
export function dragRect(x1: number, y1: number, x2: number, y2: number): { rect: Rect; exclusive: boolean } {
  return { rect: { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) }, exclusive: x2 >= x1 }
}

export const pointInRect = (p: Pt, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY

/** Does the segment a–b touch the rectangle? (Liang–Barsky clip.) */
export function segmentHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  return clip(-dx, a.x - r.minX) && clip(dx, r.maxX - a.x) && clip(-dy, a.y - r.minY) && clip(dy, r.maxY - a.y)
}

/**
 * Is a polyline (element nodes in order; `closed` for shells) selected by the rectangle? A window needs every vertex inside;
 * a crossing needs any edge to touch it (or, for a closed outline, the rectangle to lie inside the outline).
 */
export function polylineInRect(pts: Pt[], closed: boolean, r: Rect, exclusive: boolean): boolean {
  if (pts.length === 0) return false
  if (exclusive) return pts.every((p) => pointInRect(p, r))
  if (pts.length === 1) return pointInRect(pts[0], r)
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) if (segmentHitsRect(pts[i], pts[(i + 1) % pts.length], r)) return true
  return closed && pointInPolygon({ x: r.minX, y: r.minY }, pts)
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
