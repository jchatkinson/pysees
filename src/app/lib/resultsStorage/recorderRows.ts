import type { RecorderSpecWire, StageSpec } from '@/app/types/carapaceInputV1'

export interface RecorderBatch { recorderIndex: number; stageIndex: number; firstSample: number; samples: [number, number][] }

/** Recorder counters are independent: build rows by recorderIndex and stage-local sample,
 * never by a recorder's firstSample or its position among the returned batches. */
export function recorderRows(batches: RecorderBatch[], recorders: RecorderSpecWire[], kind: StageSpec['kind']): number[][] {
  if (kind === 'modal' || kind === 'reset' || !batches.length) return []
  const reference = batches[0], seen = new Set<number>()
  for (const batch of batches) {
    if (batch.stageIndex !== reference.stageIndex || batch.samples.length !== reference.samples.length ||
      !Number.isInteger(batch.recorderIndex) || !recorders[batch.recorderIndex] || seen.has(batch.recorderIndex)) throw new Error('Inconsistent recorder batches')
    seen.add(batch.recorderIndex)
  }
  return reference.samples.map(([time], sample) => {
    const row = [time, ...recorders.map((rec) => kind === 'static' && (rec.response === 'nodeVel' || rec.response === 'nodeAccel') ? 0 : NaN)]
    for (const batch of batches) {
      if (batch.samples[sample][0] !== time) throw new Error('Recorder sample times differ')
      row[1 + batch.recorderIndex] = batch.samples[sample][1]
    }
    return row
  })
}
