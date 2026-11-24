/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { TEMPLATE_FIXTURES } from '@/app/lib/commands/testkit'
import { recorderRows, rowLayout, type BulkBatch, type RecorderBatch, type RecorderOutput } from './recorderRows'
import { timelineCases } from './stepFrames'
import type { StageSpec } from '@/app/types/carapaceInputV1'
import type { StageMetadata } from '@/app/types/resultsStorage'
import type { StorageRequest } from '@/app/types/resultsStorage'

const stages: StageSpec[] = [{ kind: 'modal', id: 'eigen', modes: 1 }, { kind: 'static', id: 'push', steps: 2, integrator: { kind: 'loadControl', increment: 0.5 }, algorithm: { kind: 'linear' }, holdPatternsAfter: [] }, { kind: 'transient', id: 'shake', steps: 1, dt: 0.01, damping: { alphaM: 0, betaK: 0 }, groundMotions: [], algorithm: { kind: 'linear' } }]
// A 2-node bulk recorder (2 values per node) filling columns 3, 4 and 0, 1 (rows in reverse), and a scalar in column 2.
const layout = rowLayout(5, [[3, 4, 0, 1], [2]])
const bulk = (frames: number[][], stageIndex = 1, times = frames.map((_, i) => i)): BulkBatch => ({ recorderIndex: 0, stageIndex, firstSample: 0, elements: 2, points: 1, components: 2, progress: Float64Array.from(times), values: Float64Array.from(frames.flat()) })
const scalar = (values: number[], stageIndex = 1, recorderIndex = 1): RecorderBatch => ({ recorderIndex, stageIndex, firstSample: 7, samples: values.map((v, i) => [i, v]) })
const rows = (out: RecorderOutput) => { const r = recorderRows(out, layout, stages); return r && { stage: r.stageIndex, rows: Array.from({ length: r.count }, (_, f) => [...r.data.subarray(f * 6, f * 6 + 6)]) } }

describe('stage-specific recorder storage', () => {
  it('flushes worker blocks with contiguous run-wide sample indices across stage changes', async () => {
    vi.stubGlobal('self', {})
    try {
      const { StorageStream } = await import('@/app/workers/carapaceWorker')
      const writes: StorageRequest[] = []
      const port = { onmessage: null, postMessage: (request: StorageRequest) => writes.push(request) } as unknown as MessagePort
      const stream = new StorageStream(port, 'test', layout, stages)
      await stream.add({ recorderBatches: [scalar([5, 6])], bulkBatches: [bulk([[1, 2, 3, 4], [11, 12, 13, 14]])] })
      await stream.add({ recorderBatches: [scalar([9], 2)], bulkBatches: [bulk([[21, 22, 23, 24]], 2)] })
      await stream.flush()
      const blocks = writes.flatMap((w) => w.type === 'writeBlocks' ? w.blocks : [])
      expect(blocks.map((b) => [b.firstSample, b.sampleCount, b.stageIndex])).toEqual([[0, 2, 1], [2, 1, 2]])
      expect([...new Float64Array(blocks[0].data)]).toEqual([0, 3, 4, 5, 1, 2, 1, 13, 14, 6, 11, 12])
      expect([...new Float64Array(blocks[1].data)]).toEqual([0, 23, 24, 9, 21, 22])
    } finally { vi.unstubAllGlobals() }
  })
  it('scatters bulk and scalar values into their columns, whatever order the batches come in', () => {
    expect(rows({ recorderBatches: [scalar([5])], bulkBatches: [bulk([[1, 2, 3, 4]])] })).toEqual({ stage: 1, rows: [[0, 3, 4, 5, 1, 2]] })
    expect(rows({ recorderBatches: [scalar([5])] })).toEqual({ stage: 1, rows: [[0, NaN, NaN, 5, NaN, NaN]] })
  })
  it('does not turn modal or empty calls into time-history steps', () => {
    expect(rows({ recorderBatches: [scalar([1], 0)] })).toBeNull()
    expect(rows({ recorderBatches: [], bulkBatches: [] })).toBeNull()
  })
  it('fails inconsistent batches instead of silently storing misaligned steps', () => {
    expect(() => rows({ recorderBatches: [scalar([1, 2])], bulkBatches: [bulk([[1, 2, 3, 4]])] })).toThrow()
    expect(() => rows({ recorderBatches: [scalar([1]), scalar([2])] })).toThrow()
    expect(() => rows({ recorderBatches: [], bulkBatches: [{ ...bulk([[1, 2, 3, 4]]), values: Float64Array.of(1, 2) }] })).toThrow()
    expect(() => rows({ recorderBatches: [scalar([1], 2)], bulkBatches: [bulk([[1, 2, 3, 4]])] })).toThrow()
    expect(() => rows({ recorderBatches: [scalar([1])], bulkBatches: [bulk([[1, 2, 3, 4]], 1, [0.5])] })).toThrow()
  })
  it.each(['frame-elastic', 'frame-disp-pinned'])('retains all time-history cases of %s in stage order', (name) => {
    wasm.initSync({ module: readFileSync('src/app/carapace/wasm/carapace_wasm_bg.wasm') })
    const fixture = TEMPLATE_FIXTURES.find((f) => f.name === name)!
    const compiled = compileInputV1(fixture.model, fixture.history), input = compiled.input!
    const { rowLayout: layout } = compiled
    const session = wasm.decodeInput(input as never), timeline: number[] = [], rows: number[][] = []
    for (;;) {
      const outcome = session.advance(64) as RecorderOutput & { done: boolean; error: unknown }
      expect(outcome.error ?? null).toBeNull()
      const r = recorderRows(outcome, layout, input.sequence.stages)
      for (let f = 0; f < (r?.count ?? 0); f++) { rows.push([...r!.data.subarray(f * (layout.width + 1), (f + 1) * (layout.width + 1))]); timeline.push(r!.stageIndex) }
      if (outcome.done) break
    }
    const metadata: StageMetadata[] = input.sequence.stages.map((s, stageIndex) => ({ runId: 'test', stageIndex, stageId: s.id, kind: s.kind, status: 'complete' }))
    const cases = timelineCases(Uint16Array.from(timeline), metadata)
    expect(cases.map((c) => c.stageId)).toEqual(['static-load', 'earthquake', 'static-load-2', 'pushover'])
    expect(cases[0]).toMatchObject({ first: 0, count: 11 })
    expect(cases[1]).toMatchObject({ first: 11, count: 2000 })
    expect(cases[2]).toMatchObject({ first: 2011, count: 2 })
    expect(cases[3].first).toBe(2013)
    expect(cases.reduce((n, c) => n + c.count, 0)).toBe(rows.length)
    expect(rows.every((r) => r.length === compiled.rowLayout.width + 1 && r.every(Number.isFinite))).toBe(true)
    expect(input.sequence.recorders.every((r) => r.response === 'bulk')).toBe(true)
    const modal = session.modalResults() as { stages: { stageId: string }[] }
    expect(modal.stages.map((s) => s.stageId)).toEqual(['eigen'])
  })
  it('excludes old timeline gaps that falsely look like modal stage zero', () => {
    const metadata: StageMetadata[] = [{ runId: 'test', stageIndex: 0, stageId: 'eigen', kind: 'modal', status: 'complete' }, { runId: 'test', stageIndex: 2, stageId: 'earthquake', kind: 'transient', status: 'complete' }]
    expect(timelineCases(Uint16Array.from([0, 0, 2, 2]), metadata)).toEqual([{ stageIndex: 2, stageId: 'earthquake', kind: 'transient', first: 2, count: 2 }])
  })
})
