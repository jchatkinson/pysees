/** Pure helpers for the plot renderer: ticks, scales, decimation, hit-testing. */

/** "Nice" tick values covering [min, max]; the returned range extends to the outer ticks. */
export function niceTicks(min: number, max: number, target = 6): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 }
  if (min === max) { const d = min === 0 ? 1 : Math.abs(min) * 0.1; min -= d; max += d }
  const raw = (max - min) / Math.max(1, target)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)))
  return { ticks, min: lo, max: hi }
}

export interface Extent { min: number; max: number }

/** Finite min/max across arrays (null if there is no finite value). */
export function extentOf(...arrays: ArrayLike<number>[]): Extent | null {
  let min = Infinity
  let max = -Infinity
  for (const a of arrays) for (let i = 0; i < a.length; i++) {
    const v = a[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))
export const invertLinear = (d0: number, d1: number, r0: number, r1: number) => (p: number) => (r1 === r0 ? d0 : d0 + ((p - r0) / (r1 - r0)) * (d1 - d0))

/**
 * Indices (ascending, so path order is kept) of at most about `maxPoints` samples. Short series are
 * returned whole; long ones keep, per bucket of consecutive samples, the first, last and the min/max of
 * both x and y — so loops and spikes keep their extremes.
 */
export function decimate(x: ArrayLike<number>, y: ArrayLike<number>, maxPoints: number): Uint32Array {
  const n = Math.min(x.length, y.length)
  if (n <= maxPoints) return Uint32Array.from({ length: n }, (_, i) => i)
  const buckets = Math.max(1, Math.floor(maxPoints / 6))
  const keep: number[] = []
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor((b * n) / buckets)
    const hi = Math.floor(((b + 1) * n) / buckets)
    if (hi <= lo) continue
    let iMinX = lo, iMaxX = lo, iMinY = lo, iMaxY = lo
    for (let i = lo; i < hi; i++) {
      if (x[i] < x[iMinX]) iMinX = i
      if (x[i] > x[iMaxX]) iMaxX = i
      if (y[i] < y[iMinY]) iMinY = i
      if (y[i] > y[iMaxY]) iMaxY = i
    }
    keep.push(lo, iMinX, iMaxX, iMinY, iMaxY, hi - 1)
  }
  return Uint32Array.from([...new Set(keep)].sort((a, b) => a - b))
}

/** Index into `indices` of the point nearest (px, py) in screen space, with its pixel distance. */
export function nearestPoint(
  px: number, py: number,
  indices: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>,
  sx: (v: number) => number, sy: (v: number) => number,
): { k: number; dist: number } | null {
  let best = -1
  let bestD = Infinity
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]
    const d = Math.hypot(sx(x[i]) - px, sy(y[i]) - py)
    if (d < bestD) { bestD = d; best = k }
  }
  return best < 0 ? null : { k: best, dist: bestD }
}

export function formatTick(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  return a >= 1e5 || a < 1e-3 ? v.toExponential(1).replace('+', '') : Number(v.toPrecision(4)).toString()
}
