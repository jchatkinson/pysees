import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { SceneIndex } from '@/app/components/r3f/sceneIndex'
import { SHELL_GAUSS_POINTS, SHELL_RESULTANTS } from '@/app/lib/carapace/compileInputV1'

export type ShellResultant = (typeof SHELL_RESULTANTS)[number]
export { SHELL_RESULTANTS }

/** What each resultant is, for the picker: membrane force, plate moment, transverse shear, per unit length in the shell's local axes. */
export const SHELL_RESULTANT_LABELS: Record<ShellResultant, string> = {
  Nx: 'Membrane Nx', Ny: 'Membrane Ny', Nxy: 'Membrane shear Nxy', Mx: 'Bending Mx', My: 'Bending My', Mxy: 'Twisting Mxy', Qx: 'Shear Qx', Qy: 'Shear Qy',
}

const S3 = Math.sqrt(3)
/** Quad Gauss points `(-,-) (+,-) (+,+) (-,+)` as signs; a corner's value is the bilinear extrapolation `∑ f_g (1 + √3 σ_c σ_g)(1 + √3 τ_c τ_g) / 4`. */
const SIGNS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
const QUAD_EXTRAPOLATION: number[][] = SIGNS.map(([sc, tc]) => SIGNS.map(([sg, tg]) => ((1 + S3 * sc * sg) * (1 + S3 * tc * tg)) / 4))

/**
 * A triangle's three outer Gauss points `(.6,.2,.2) (.2,.6,.2) (.2,.2,.6)` sit nearest nodes 0, 1 and 2 (recorder indices 2, 1, 3; the
 * centre point, with its negative weight, is left out). The linear field through them has corner values `M^-1 f` with
 * `M = 0.4 I + 0.2 J`, i.e. `2.5 f_k - 0.5 (f_0 + f_1 + f_2)`.
 */
const TRI_EXTRAPOLATION: number[][] = [2, 1, 3].map((own) => [0, 1, 2, 3].map((g) => (g === 0 ? 0 : (g === own ? 2.5 : 0) - 0.5)))

/** Corner values of a shell from its four Gauss-point values (recorder order). */
export function extrapolateToCorners(gauss: ArrayLike<number>, corners: 3 | 4): number[] {
  const table = corners === 4 ? QUAD_EXTRAPOLATION : TRI_EXTRAPOLATION
  return table.map((weights) => weights.reduce((sum, w, g) => sum + w * gauss[g], 0))
}

/**
 * Smoothed nodal value of one resultant over the whole step row: each shell's Gauss values are extrapolated to its corners
 * and the corner values at a shared node are averaged. `out` has one entry per node (NaN where no shell with recorded
 * resultants touches it). Returns the range over the nodes that have a value.
 */
export function shellNodalValues(index: SceneIndex, layout: RunLayout, row: Float64Array, component: ShellResultant, out: Float32Array, counts: Uint16Array): { min: number; max: number } | null {
  out.fill(0)
  counts.fill(0)
  const c = SHELL_RESULTANTS.indexOf(component)
  index.elementIds.forEach((id, e) => {
    if (index.elementKind[e] !== 'shell') return
    const entry = layout.columns.shell.get(id)
    if (!entry) return
    const rows = index.elementNodes[e]
    const gauss = Array.from({ length: SHELL_GAUSS_POINTS }, (_, g) => row[entry.offset + g * SHELL_RESULTANTS.length + c])
    extrapolateToCorners(gauss, rows.length as 3 | 4).forEach((v, k) => { out[rows[k]] += v; counts[rows[k]]++ })
  })
  let min = Infinity, max = -Infinity
  for (let i = 0; i < out.length; i++) {
    if (counts[i] === 0) { out[i] = NaN; continue }
    out[i] /= counts[i]
    min = Math.min(min, out[i]); max = Math.max(max, out[i])
  }
  return min <= max ? { min, max } : null
}

/** Blue - cyan - green - yellow - red, the usual structural contour ramp. */
const RAMP: [number, number, number][] = [[0.05, 0.2, 0.85], [0.1, 0.75, 0.9], [0.2, 0.8, 0.3], [0.95, 0.85, 0.15], [0.85, 0.15, 0.1]]
export function rampColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x))
  const f = x - i
  return [0, 1, 2].map((k) => RAMP[i][k] + f * (RAMP[i + 1][k] - RAMP[i][k])) as [number, number, number]
}
export const RAMP_CSS = `linear-gradient(to right, ${RAMP.map(([r, g, b], i) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}) ${(i / (RAMP.length - 1)) * 100}%`).join(', ')})`

/** Writes `rgb` per node from the values and range (a flat range maps to the middle colour); nodes without a value stay grey. */
export function fillContourColors(values: Float32Array, range: { min: number; max: number }, out: Float32Array): void {
  const span = range.max - range.min
  for (let i = 0; i < values.length; i++) {
    const [r, g, b] = Number.isNaN(values[i]) ? [0.7, 0.7, 0.7] : rampColor(span > 1e-12 ? (values[i] - range.min) / span : 0.5)
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b
  }
}
