import { describe, expect, it } from 'vitest'
import { buildSceneIndex } from '@/app/components/r3f/sceneIndex'
import { caseResultExtrema, createExtremaAccumulator } from './resultsExtrema'
import type { RunLayout, StepFrame } from './resultsStorage/stepFrames'
import type { RecorderKind } from '@/app/types/resultsStorage'
import type { ElementEntity, NodeEntity } from '@/app/types/model'

function fixture(ndm: 2 | 3 = 3, truss = false) {
  const nodes = new Map<number, NodeEntity>([[2, { id: 2, coords: [0, 0, 0] }], [8, { id: 8, coords: truss ? [3, 4, 0] : [10, 0, 0] }]])
  const elements = new Map<number, ElementEntity>([[17, { id: 17, eleType: truss ? 'Truss' : 'ElasticBeamColumn', nodes: [2, 8], args: {} }]])
  const index = buildSceneIndex(nodes, elements, new Map(), ndm)
  const columns = Object.fromEntries(['disp', 'vel', 'accel', 'reaction', 'force', 'shell'].map((kind) => [kind, new Map()])) as RunLayout['columns']
  const layout = { columns } as RunLayout
  const entry = (kind: RecorderKind, id: number, labels: string[], offset = 1) => columns[kind].set(id, { labels, offset })
  const frame = (values: number[], step = 0, time = step * 0.01): StepFrame => ({ step, pseudoTime: time, row: Float64Array.from([time, ...values]) })
  return { index, layout, entry, frame }
}

describe('selected result extrema', () => {
  it('tracks displacement magnitude, timestep and node ID, excluding rotational components', () => {
    const { index, layout, entry, frame } = fixture()
    entry('disp', 2, ['dx', 'dy', 'dz', 'rx']); entry('disp', 8, ['dx', 'dy', 'dz', 'rx'], 5)
    const scan = createExtremaAccumulator(index, layout, 'deformed', 'Nx')
    scan.add(frame([3, 4, 0, 999, 3, 4, 12, 999], 10, 0.5))
    scan.add(frame([1, 0, 0, 999, 0, 0, 0, 999], 11, 0.6))
    expect(scan.result()).toEqual({ max: { value: 13, step: 10, time: 0.5, target: 'Node', id: 8 }, min: { value: 0, step: 11, time: 0.6, target: 'Node', id: 8 } })
  })
  it('uses only in-plane translation for 2D and skips invalid samples', () => {
    const { index, layout, entry, frame } = fixture(2)
    entry('disp', 8, ['dx', 'dy', 'dz'])
    const scan = createExtremaAccumulator(index, layout, 'deformed', 'Nx')
    scan.add(frame([3, 4, 12])); scan.add(frame([NaN, 0, 0])); scan.add(frame([Infinity, 0, 0]))
    expect(scan.result()?.max.value).toBe(5)
    expect(scan.result()?.min.value).toBe(5)
  })
  it('includes the exact interior bending peak under a distributed load', () => {
    const { index, layout, entry, frame } = fixture(2)
    entry('force', 17, ['Ni', 'Vi', 'Mi', 'wx', 'wy'])
    const scan = createExtremaAccumulator(index, layout, 'moment', 'Nx')
    scan.add(frame([0, 10, 0, 0, -2], 7, 0.07))
    expect(scan.result()?.max).toEqual({ value: 25, step: 7, time: 0.07, target: 'Element', id: 17 })
    expect(scan.result()?.min.value).toBe(0)
  })
  it.each([
    ['axial', -30, -10], ['shear', -10, 10], ['shearZ', -4, 6], ['momentY', 4, 22], ['torsion', -7, -7],
  ] as const)('matches the 3D %s diagram sign and component', (type, min, max) => {
    const { index, layout, entry, frame } = fixture()
    entry('force', 17, ['Ni', 'Vyi', 'Mzi', 'Vzi', 'Myi', 'Ti', 'wx', 'wy', 'wz'])
    const scan = createExtremaAccumulator(index, layout, type, 'Nx')
    scan.add(frame([10, 10, 0, 6, 4, 7, 2, -2, -1]))
    expect(scan.result()?.min.value).toBe(min)
    expect(scan.result()?.max.value).toBe(max)
  })
  it('projects truss global forces along the member and omits other diagram types', () => {
    const { index, layout, entry, frame } = fixture(3, true)
    entry('force', 17, ['Fxj', 'Fyj', 'Fzj'])
    const scan = createExtremaAccumulator(index, layout, 'axial', 'Nx')
    scan.add(frame([6, 8, 0]))
    expect(scan.result()?.max.value).toBe(10)
    const shear = createExtremaAccumulator(index, layout, 'shear', 'Nx')
    shear.add(frame([6, 8, 0]))
    expect(shear.result()).toBeNull()
  })
  it('reports smoothed shell contour extrema at their node IDs', () => {
    const { layout, entry, frame } = fixture()
    const nodes = new Map([1, 2, 3, 4].map((id, i) => [id, { id, coords: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]][i] }]))
    const index = buildSceneIndex(nodes, new Map([[20, { id: 20, eleType: 'ShellMITC4', nodes: [1, 2, 3, 4], args: {} }]]), new Map(), 3)
    entry('shell', 20, Array.from({ length: 32 }, (_, i) => String(i)))
    const scan = createExtremaAccumulator(index, layout, 'contour', 'Nx')
    scan.add(frame(Array.from({ length: 32 }, (_, i) => i % 8 === 0 ? 5 : 0), 3))
    expect(scan.result()?.max).toMatchObject({ value: 5, target: 'Node', id: 1, step: 3 })
    expect(scan.result()?.min.value).toBe(5)
  })
  it('limits the scan to the chosen case and reports the original pseudo-time', async () => {
    const { index, layout, entry, frame } = fixture()
    entry('force', 17, ['Ni'])
    const rows = [frame([-999], 0, 0), frame([-2], 1, 0.1), frame([4], 2, 0.2), frame([999], 3, 0)]
    const extrema = await caseResultExtrema({ layout, get: async (s) => rows[s] }, index, 1, 2, 'axial', 'Nx')
    expect(extrema).toEqual({ max: { value: 2, step: 1, time: 0.1, target: 'Element', id: 17 }, min: { value: -4, step: 2, time: 0.2, target: 'Element', id: 17 } })
  })
  it('stops a stale scan when the selected result or case changes', async () => {
    const { index, layout, frame } = fixture()
    const controller = new AbortController()
    let calls = 0
    const extrema = await caseResultExtrema({ layout, get: async (s) => { calls++; controller.abort(); return frame([], s) } }, index, 0, 50, 'deformed', 'Nx', controller.signal)
    expect(extrema).toBeNull(); expect(calls).toBe(1)
  })
})
