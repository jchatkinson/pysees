import { describe, expect, it } from 'vitest'
import type { ElementEntity, NodeEntity } from '@/app/types/model'
import { gridSlab, viewSlice } from './viewSlice'

// Two bays along X (grids 1-3 at x = 0, 6, 12), one along Y (A at y = 0, B at y = 5), two 3 m stories.
const grids = [
  { id: 1, label: '1', start: [0, 0], end: [0, 5] }, { id: 2, label: '2', start: [6, 0], end: [6, 5] }, { id: 3, label: '3', start: [12, 0], end: [12, 5] },
  { id: 4, label: 'A', start: [0, 0], end: [12, 0] }, { id: 5, label: 'B', start: [0, 5], end: [12, 5] },
]
const levels = [{ id: 1, label: 'L1', height: 3 }, { id: 2, label: 'L2', height: 3 }]
const nodes = new Map<number, NodeEntity>()
let nid = 1
const at = (x: number, y: number, zz: number) => { const id = nid++; nodes.set(id, { id, coords: [x, y, zz] }); return id }
const elements = new Map<number, ElementEntity>()
let eid = 1
const ele = (a: number, b: number) => { const id = eid++; elements.set(id, { id, eleType: 'Truss', nodes: [a, b], args: {} }); return id }

const base = at(0, 0, 0), l1 = at(0, 0, 3), l2 = at(0, 0, 6), l1b = at(6, 0, 3), l2b = at(6, 0, 6), mid = at(3, 2.4, 3), free = at(9, 1, 3)
const col1 = ele(base, l1), col2 = ele(l1, l2), beam1 = ele(l1, l1b), beam2 = ele(l2, l2b), inner = ele(l1, mid)

describe('viewSlice', () => {
  it('plan at L1: floor L1 and the columns under it, story above as ghosts', () => {
    const s = viewSlice({ kind: 'plan', level: 0 }, nodes, elements, levels, grids, 3)!
    expect([...s.elements.keys()].sort()).toEqual([col1, beam1, inner].sort())
    expect(s.ghostElements.map((e) => e.id).sort()).toEqual([col2, beam2].sort())
    expect(s.nodes.has(base)).toBe(true) // bottom of a shown column
    expect(s.nodes.has(free)).toBe(true) // a free node on the level
    expect(s.nodes.has(l1b)).toBe(true)
    expect(s.nodes.has(l2)).toBe(false)
  })

  it('plan at the top level has no ghosts; base plan shows base nodes only', () => {
    expect(viewSlice({ kind: 'plan', level: 1 }, nodes, elements, levels, grids, 3)!.ghostElements).toEqual([])
    const b = viewSlice({ kind: 'plan', level: -1 }, nodes, elements, levels, grids, 3)!
    expect(b.elements.size).toBe(0)
    expect([...b.nodes.keys()]).toEqual([base])
    expect(b.ghostElements.map((e) => e.id)).toEqual([col1, beam1, inner])
  })

  it('elevation on a grid takes everything within half the bay on each side', () => {
    const slab = gridSlab(grids, 4, 0.01)!
    expect(slab.below).toBe(0.01) // nothing parallel on the -Y side
    expect(slab.above).toBe(2.5)
    const s = viewSlice({ kind: 'elevation', gridId: 4 }, nodes, elements, levels, grids, 3)!
    expect([...s.elements.keys()].sort()).toEqual([col1, col2, beam1, beam2, inner].sort()) // mid is at y = 2.4 < 2.5
    const onB = viewSlice({ kind: 'elevation', gridId: 5 }, nodes, elements, levels, grids, 3)!
    expect(onB.elements.size).toBe(0)
  })

  it('3D, 2D and a whole-model elevation are unfiltered', () => {
    expect(viewSlice({ kind: '3d' }, nodes, elements, levels, grids, 3)).toBeNull()
    expect(viewSlice({ kind: 'elevation', gridId: null }, nodes, elements, levels, grids, 3)).toBeNull()
    expect(viewSlice({ kind: 'plan', level: 0 }, nodes, elements, levels, grids, 2)).toBeNull()
  })
})

describe('stepView', async () => {
  const { stepView } = await import('./viewCamera')
  it('steps stories and parallel grids, stopping at the ends', () => {
    expect(stepView({ kind: 'plan', level: 0 }, levels, grids, 1)).toEqual({ kind: 'plan', level: 1 })
    expect(stepView({ kind: 'plan', level: 1 }, levels, grids, 1)).toBeNull()
    expect(stepView({ kind: 'plan', level: 0 }, levels, grids, -1)).toEqual({ kind: 'plan', level: -1 })
    expect(stepView({ kind: 'elevation', gridId: 1 }, levels, grids, 1)).toEqual({ kind: 'elevation', gridId: 2 })
    expect(stepView({ kind: 'elevation', gridId: 4 }, levels, grids, 1)).toEqual({ kind: 'elevation', gridId: 5 })
    expect(stepView({ kind: 'elevation', gridId: 3 }, levels, grids, 1)).toBeNull()
  })
})
