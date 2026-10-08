import type { ModalStageResult } from '@/app/types/resultsStorage'
import type { NodeDisplacements } from '@/app/components/r3f/displaced'
import type { SceneIndex } from '@/app/components/r3f/sceneIndex'

type Mode = ModalStageResult['modes'][number]

/** Period in seconds from a circular frequency in rad/s (Infinity for a rigid-body mode). */
export const modePeriod = (omega: number): number => (omega > 0 ? (2 * Math.PI) / omega : Infinity)
export const modeFrequencyHz = (omega: number): number => omega / (2 * Math.PI)

const sig = (v: number, digits = 4) => (Number.isFinite(v) ? String(Number(v.toPrecision(digits))) : '∞')

/** "T = 0.4523 s (f = 2.211 Hz)" */
export function modeTimingText(mode: Mode): string {
  return `T = ${sig(modePeriod(mode.frequency))} s (f = ${sig(modeFrequencyHz(mode.frequency))} Hz)`
}

/** Tag -> row of the node-major shape. */
export function nodeRows(nodeTags: number[]): Map<number, number> {
  return new Map(nodeTags.map((tag, row) => [tag, row]))
}

/** Largest in-plane translation of the (unit-normalised) shape — what the auto scale draws at a readable size. */
export function modeTranslationPeak(stage: ModalStageResult, mode: Mode): number {
  const { ndf, } = stage
  let peak = 0
  for (let i = 0; i + 1 < mode.shape.length; i += ndf) peak = Math.max(peak, Math.hypot(mode.shape[i], mode.shape[i + 1], ndf === 6 ? mode.shape[i + 2] : 0))
  return peak
}

/** Writes the mode shape into `out` (same layout `readNodeDisplacements` fills): scene nodes the model's node table doesn't list get zeros. */
export function readModeShape(index: SceneIndex, rows: Map<number, number>, stage: ModalStageResult, mode: Mode, out: NodeDisplacements): void {
  out.disp.fill(0)
  out.rot.fill(NaN)
  const { ndf, } = stage
  for (let i = 0; i < index.nodeIds.length; i++) {
    const row = rows.get(index.nodeIds[i])
    if (row === undefined) continue
    const base = row * ndf
    out.disp[i * 3] = mode.shape[base]
    out.disp[i * 3 + 1] = mode.shape[base + 1]
    if (ndf === 6) out.disp[i * 3 + 2] = mode.shape[base + 2]
    if (ndf === 6) { out.rot[i * 3] = mode.shape[base + 3]; out.rot[i * 3 + 1] = mode.shape[base + 4] }
    out.rot[i * 3 + 2] = mode.shape[base + (ndf === 6 ? 5 : 2)]
  }
}
