import type { RunLayout, StepFrame } from './resultsStorage/stepFrames'
import type { ResultType } from '@/app/types/resultsView'
import type { SceneIndex } from '@/app/components/r3f/sceneIndex'
import { sectionForces } from '@/app/components/r3f/diagrams'
import { shellNodalValues, type ShellResultant } from './shellContour'

export interface ResultExtreme { value: number; step: number; time: number; target: 'Node' | 'Element'; id: number }
export interface ResultExtrema { min: ResultExtreme; max: ResultExtreme }
export type ExtremaResultType = Exclude<ResultType, 'none' | 'mode'>

/** Same physical values and signs as the viewport, without its visual amplification. */
export function createExtremaAccumulator(index: SceneIndex, layout: RunLayout, type: ExtremaResultType, contour: ShellResultant) {
  let extrema: ResultExtrema | null = null
  const contourValues = new Float32Array(index.nodeIds.length), counts = new Uint16Array(index.nodeIds.length)
  const observe = (value: number, frame: StepFrame, target: ResultExtreme['target'], id: number) => {
    if (!Number.isFinite(value)) return
    const result = { value, step: frame.step, time: frame.pseudoTime, target, id }
    if (!extrema) extrema = { min: result, max: result }
    else { if (value < extrema.min.value) extrema.min = result; if (value > extrema.max.value) extrema.max = result }
  }
  return {
    add(frame: StepFrame) {
      const { row } = frame
      if (type === 'deformed') {
        for (const id of index.nodeIds) {
          const entry = layout.columns.disp.get(id)
          if (!entry) continue
          const axes = ['dx', 'dy', ...(index.ndm === 3 ? ['dz'] : [])]
          const values = axes.map((label) => entry.labels.indexOf(label)).filter((c) => c >= 0).map((c) => row[entry.offset + c])
          if (values.length) observe(Math.hypot(...values), frame, 'Node', id)
        }
      } else if (type === 'contour') {
        shellNodalValues(index, layout, row, contour, contourValues, counts)
        index.nodeIds.forEach((id, i) => observe(contourValues[i], frame, 'Node', id))
      } else {
        index.elementIds.forEach((id, e) => {
          const nodes = index.elementNodes[e], kind = index.elementKind[e], entry = layout.columns.force.get(id)
          if (!entry || nodes.length !== 2 || kind === 'other' || kind === 'shell' || (kind === 'truss' && type !== 'axial')) return
          const a = nodes[0] * 3, b = nodes[1] * 3, c = index.nodeCoords
          const chord = [c[b] - c[a], c[b + 1] - c[a + 1], c[b + 2] - c[a + 2]], length = Math.hypot(...chord)
          if (length < 1e-9) return
          const f = (label: string, fallback = NaN) => { const col = entry.labels.indexOf(label); return col < 0 ? fallback : row[entry.offset + col] }
          if (kind === 'truss') {
            const labels = index.ndm === 3 ? ['Fxj', 'Fyj', 'Fzj'] : ['Nj', 'Vj']
            observe(labels.reduce((sum, label, i) => sum + f(label) * chord[i] / length, 0), frame, 'Element', id)
          } else if (type === 'torsion') observe(-f('Ti'), frame, 'Element', id)
          else {
            const planeZ = type === 'shearZ' || type === 'momentY'
            const fy = planeZ ? f('Vzi') : f(index.ndm === 3 ? 'Vyi' : 'Vi')
            const mz = planeZ ? -f('Myi') : f(index.ndm === 3 ? 'Mzi' : 'Mi')
            const load = { wx: f('wx', 0), wy: f(planeZ ? 'wz' : 'wy', 0) }
            const stations = [0, length]
            // Quadratic moments can peak between endpoints, where the shear crosses zero.
            const peak = -fy / load.wy
            if ((type === 'moment' || type === 'momentY') && peak > 0 && peak < length) stations.push(peak)
            for (const x of stations) {
              const forces = sectionForces(f('Ni'), fy, mz, load, x)
              observe(type === 'axial' ? forces.n : type === 'shear' || type === 'shearZ' ? forces.v : forces.m, frame, 'Element', id)
            }
          }
        })
      }
    },
    result: () => extrema,
  }
}

/** Scan a case through the bounded block cache; never retain the run's full dense result table. */
export async function caseResultExtrema(source: { layout: RunLayout; get: (step: number) => Promise<StepFrame | null> }, index: SceneIndex, first: number, count: number, type: ExtremaResultType, contour: ShellResultant, signal?: AbortSignal): Promise<ResultExtrema | null> {
  const accumulator = createExtremaAccumulator(index, source.layout, type, contour)
  for (let step = first; step < first + count; step++) {
    if (signal?.aborted) return null
    const frame = await source.get(step)
    if (signal?.aborted) return null
    if (frame) accumulator.add(frame)
    if ((step - first + 1) % 64 === 0) await new Promise((resolve) => setTimeout(resolve, 0)) // Let playback and UI events continue during large scans.
  }
  return accumulator.result()
}
