import type { StageSpec } from '@/app/types/carapaceInputV1'

/** A scalar recorder's samples from one `advance()` call. */
export interface RecorderBatch { recorderIndex: number; stageIndex: number; firstSample: number; samples: [number, number][] }
/** A bulk recorder's frames from one `advance()` call: `values` is frame-major, `elements × points × components` per frame. */
export interface BulkBatch { recorderIndex: number; stageIndex: number; firstSample: number; elements: number; points: number; components: number; progress: ArrayLike<number>; values: ArrayLike<number> }
/** The recorder output of one `advance()` call. */
export interface RecorderOutput { recorderBatches: RecorderBatch[]; bulkBatches?: BulkBatch[] }

/** Where each wire recorder's values go in a stored step row `[pseudoTime, ...width columns]`: `columns[i][k]` is the column (counted
 * after pseudo-time) of value `k` of recorder `i`'s frame. A scalar recorder has one value per frame. */
export interface RowLayout { width: number; columns: Int32Array[] }
export const rowLayout = (width: number, columns: number[][]): RowLayout => ({ width, columns: columns.map((c) => Int32Array.from(c)) })

/** Dense step rows, flat: `count` rows of `1 + width` values. */
export interface StepRows { stageIndex: number; count: number; data: Float64Array }

/** One `advance()` call's samples as dense step rows, or null for a call that recorded no steps (modal and reset stages never do).
 * Recorders are aligned by frame position in the call, never by their own sample counters. A column no recorder wrote stays NaN. */
export function recorderRows(out: RecorderOutput, layout: RowLayout, stages: StageSpec[]): StepRows | null {
  const scalars = out.recorderBatches.filter((b) => b.samples.length), bulks = out.bulkBatches ?? []
  const first = bulks[0] ?? scalars[0]
  if (!first) return null
  const stageIndex = first.stageIndex, kind = stages[stageIndex]?.kind
  if (kind !== 'static' && kind !== 'transient') return null
  const times = bulks.length ? bulks[0].progress : scalars[0].samples.map(([t]) => t)
  const count = times.length, stride = 1 + layout.width
  const data = new Float64Array(count * stride).fill(NaN)
  for (let f = 0; f < count; f++) data[f * stride] = times[f]
  const seen = new Set<number>()
  const columnsOf = (b: { recorderIndex: number; stageIndex: number }) => {
    const columns = layout.columns[b.recorderIndex]
    if (b.stageIndex !== stageIndex || !columns || seen.has(b.recorderIndex)) throw new Error('Inconsistent recorder batches')
    seen.add(b.recorderIndex)
    return columns
  }
  for (const b of bulks) {
    const columns = columnsOf(b), w = columns.length
    if (b.progress.length !== count || b.values.length !== count * w) throw new Error(`Bulk recorder ${b.recorderIndex} returned ${b.values.length} values for ${count} steps of ${w}`)
    for (let f = 0; f < count; f++) {
      if (b.progress[f] !== times[f]) throw new Error('Recorder sample times differ')
      const row = f * stride + 1, from = f * w
      for (let k = 0; k < w; k++) data[row + columns[k]] = b.values[from + k]
    }
  }
  for (const b of scalars) {
    const column = columnsOf(b)[0]
    if (b.samples.length !== count) throw new Error('Inconsistent recorder batches')
    b.samples.forEach(([t, v], f) => {
      if (t !== times[f]) throw new Error('Recorder sample times differ')
      data[f * stride + 1 + column] = v
    })
  }
  return { stageIndex, count, data }
}
