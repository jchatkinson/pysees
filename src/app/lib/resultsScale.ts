import type { Model } from '@/app/types/model'
import type { RunExtents } from '@/app/types/resultsStorage'
import type { ScaleKey } from '@/app/types/resultsView'

/** Peak component values that set each result's scale (component labels from compileInputV1). */
const PEAK_LABELS: Record<Exclude<ScaleKey, 'mode'>, { kind: 'disp' | 'force'; labels: string[] }> = {
  deformed: { kind: 'disp', labels: ['dx', 'dy', 'dz'] },
  axial: { kind: 'force', labels: ['Ni', 'Nj'] },
  shear: { kind: 'force', labels: ['Vi', 'Vj'] },
  moment: { kind: 'force', labels: ['Mi', 'Mj'] },
}

/** Fraction of the model's bounding-box diagonal the peak value is drawn at. Based on the model, not the mesh, so a column
 * split into many short elements gets the same diagram size as one split into a few. */
const DEFORMED_FRACTION = 0.1
const DIAGRAM_FRACTION = 0.05

export interface ModelMetrics {
  /** Bounding-box diagonal of the nodes. */
  diagonal: number
  /** Every element is a truss — whose recorded force is global-frame, so axial force is |(Ni,Vi)|, not Ni. */
  trussOnly: boolean
}

export function modelMetrics(model: Model): ModelMetrics {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const n of model.nodes.values()) for (let k = 0; k < 3; k++) {
    const v = n.coords[k] ?? 0
    min[k] = Math.min(min[k], v)
    max[k] = Math.max(max[k], v)
  }
  const diagonal = model.nodes.size ? Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) : 0
  const trussOnly = model.elements.size > 0 && [...model.elements.values()].every((el) => /^truss$/i.test(el.eleType))
  return { diagonal, trussOnly }
}

/** Scale (world units per result unit) that draws the run's peak value at a readable size. */
export function autoScale(key: Exclude<ScaleKey, 'mode'>, extents: RunExtents | null, metrics: ModelMetrics): number {
  const { kind, labels } = PEAK_LABELS[key]
  let peak = Math.max(0, ...labels.map((l) => extents?.[kind][l] ?? 0))
  if (key === 'axial' && metrics.trussOnly) peak = Math.hypot(peak, extents?.force.Vi ?? 0, extents?.force.Vj ?? 0)
  const reference = key === 'deformed' ? metrics.diagonal * DEFORMED_FRACTION : metrics.diagonal * DIAGRAM_FRACTION
  return peak > 0 && reference > 0 ? reference / peak : 1
}

/** Scale that draws a mode shape's largest translation (`peak`, in the unit-normalised shape's own units) at a readable size. */
export function autoModeScale(peak: number, metrics: ModelMetrics): number {
  return peak > 0 && metrics.diagonal > 0 ? (metrics.diagonal * DEFORMED_FRACTION) / peak : 1
}
