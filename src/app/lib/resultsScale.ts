import type { Model } from '@/app/types/model'
import type { RunExtents } from '@/app/types/resultsStorage'
import type { ScaleKey } from '@/app/types/resultsView'

/** Peak component values that set each result's scale (component labels from compileInputV1). */
const PEAK_LABELS: Record<ScaleKey, { kind: 'disp' | 'force'; labels: string[] }> = {
  deformed: { kind: 'disp', labels: ['dx', 'dy', 'dz'] },
  axial: { kind: 'force', labels: ['Ni', 'Nj'] },
  shear: { kind: 'force', labels: ['Vi', 'Vj'] },
  moment: { kind: 'force', labels: ['Mi', 'Mj'] },
}

/** Fraction of the reference length the peak value is drawn at. */
const DEFORMED_FRACTION = 0.1
const DIAGRAM_FRACTION = 0.15

export interface ModelMetrics {
  /** Bounding-box diagonal of the nodes. */
  diagonal: number
  meanElementLength: number
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
  let total = 0
  let count = 0
  let trussOnly = model.elements.size > 0
  for (const el of model.elements.values()) {
    if (!/^truss$/i.test(el.eleType)) trussOnly = false
    const a = model.nodes.get(el.nodes[0])
    const b = model.nodes.get(el.nodes[el.nodes.length - 1])
    if (!a || !b) continue
    total += Math.hypot((a.coords[0] ?? 0) - (b.coords[0] ?? 0), (a.coords[1] ?? 0) - (b.coords[1] ?? 0), (a.coords[2] ?? 0) - (b.coords[2] ?? 0))
    count++
  }
  return { diagonal, meanElementLength: count ? total / count : 0, trussOnly }
}

/** Scale (world units per result unit) that draws the run's peak value at a readable size. */
export function autoScale(key: ScaleKey, extents: RunExtents | null, metrics: ModelMetrics): number {
  const { kind, labels } = PEAK_LABELS[key]
  let peak = Math.max(0, ...labels.map((l) => extents?.[kind][l] ?? 0))
  if (key === 'axial' && metrics.trussOnly) peak = Math.hypot(peak, extents?.force.Vi ?? 0, extents?.force.Vj ?? 0)
  const reference = key === 'deformed' ? metrics.diagonal * DEFORMED_FRACTION : metrics.meanElementLength * DIAGRAM_FRACTION
  return peak > 0 && reference > 0 ? reference / peak : 1
}
