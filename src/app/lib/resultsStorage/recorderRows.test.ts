/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { TEMPLATE_FIXTURES } from '@/app/lib/commands/testkit'
import { recorderRows, type RecorderBatch } from './recorderRows'
import { timelineCases } from './stepFrames'
import type { RecorderSpecWire } from '@/app/types/carapaceInputV1'
import type { StageMetadata } from '@/app/types/resultsStorage'
import type { StorageRequest } from '@/app/types/resultsStorage'

const recorders: RecorderSpecWire[] = [{ response: 'nodeDisp', node: 0, dof: 0 }, { response: 'nodeVel', node: 0, dof: 0 }, { response: 'nodeAccel', node: 0, dof: 0 }, { response: 'reaction', node: 0, dof: 0 }]
const batch = (recorderIndex: number, values: number[], firstSample = 0): RecorderBatch => ({ recorderIndex, stageIndex: 1, firstSample, samples: values.map((v, i) => [i, v]) })

describe('stage-specific recorder storage', () => {
  it('flushes worker blocks with contiguous run-wide sample indices across stage changes', async () => {
    vi.stubGlobal('self', {})
    try {
      const { StorageStream } = await import('@/app/workers/carapaceWorker')
      const writes: StorageRequest[] = []
      const port = { onmessage: null, postMessage: (request: StorageRequest) => writes.push(request) } as unknown as MessagePort
      const stream = new StorageStream(port, 'test', recorders)
      await stream.add([batch(0, [1, 2], 10), batch(3, [3, 4], 10)], 'static')
      await stream.add([batch(0, [5, 6], 12), batch(1, [7, 8]), batch(2, [9, 10]), batch(3, [11, 12], 12)].map((b) => ({ ...b, stageIndex: 2 })), 'transient')
      await stream.flush()
      const blocks = writes.flatMap((w) => w.type === 'writeBlocks' ? w.blocks : [])
      expect(blocks.map((b) => [b.firstSample, b.sampleCount, b.stageIndex])).toEqual([[0, 2, 1], [2, 2, 2]])
      expect([...new Float64Array(blocks[0].data)]).toEqual([0, 1, 0, 0, 3, 1, 2, 0, 0, 4])
      expect([...new Float64Array(blocks[1].data)]).toEqual([0, 5, 7, 9, 11, 1, 6, 8, 10, 12])
    } finally { vi.unstubAllGlobals() }
  })
  it('preserves static columns despite missing dynamic recorders and unordered batches', () => {
    expect(recorderRows([batch(3, [10, 20]), batch(0, [1, 2])], recorders, 'static')).toEqual([[0, 1, 0, 0, 10], [1, 2, 0, 0, 20]])
  })
  it('ignores independent recorder sample counters when aligning a transient batch', () => {
    expect(recorderRows([batch(0, [1], 11), batch(1, [2]), batch(2, [3]), batch(3, [4], 11)], recorders, 'transient')).toEqual([[0, 1, 2, 3, 4]])
  })
  it('does not turn modal recorder samples into time-history cases', () => {
    expect(recorderRows([batch(0, [1])], recorders, 'modal')).toEqual([])
  })
  it('fails inconsistent batches instead of silently discarding valid stages', () => {
    expect(() => recorderRows([batch(0, [1, 2]), batch(3, [1])], recorders, 'static')).toThrow()
    expect(() => recorderRows([batch(0, [1]), batch(0, [2])], recorders, 'static')).toThrow()
  })
  it.each(['frame-elastic', 'frame-disp-pinned'])('retains all time-history cases of %s in stage order', (name) => {
    wasm.initSync({ module: readFileSync('src/app/carapace/wasm/carapace_wasm_bg.wasm') })
    const fixture = TEMPLATE_FIXTURES.find((f) => f.name === name)!
    const input = compileInputV1(fixture.model, fixture.history).input!
    const session = wasm.decodeInput(input), timeline: number[] = [], rows: number[][] = []
    for (;;) {
      const outcome = session.advance(64) as { done: boolean; error: unknown; recorderBatches: RecorderBatch[] }
      expect(outcome.error ?? null).toBeNull()
      const batches = outcome.recorderBatches
      if (batches.length) {
        const stage = batches[0].stageIndex
        const dense = recorderRows(batches, input.sequence.recorders, input.sequence.stages[stage].kind)
        rows.push(...dense); timeline.push(...dense.map(() => stage))
      }
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
    expect(rows.every((r) => r.length === input.sequence.recorders.length + 1 && r.every(Number.isFinite))).toBe(true)
    const modal = session.modalResults() as { stages: { stageId: string }[] }
    expect(modal.stages.map((s) => s.stageId)).toEqual(['eigen'])
  })
  it('excludes old timeline gaps that falsely look like modal stage zero', () => {
    const metadata: StageMetadata[] = [{ runId: 'test', stageIndex: 0, stageId: 'eigen', kind: 'modal', status: 'complete' }, { runId: 'test', stageIndex: 2, stageId: 'earthquake', kind: 'transient', status: 'complete' }]
    expect(timelineCases(Uint16Array.from([0, 0, 2, 2]), metadata)).toEqual([{ stageIndex: 2, stageId: 'earthquake', kind: 'transient', first: 2, count: 2 }])
  })
})
