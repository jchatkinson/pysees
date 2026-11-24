import { describe, expect, it } from 'vitest'
import { emptyModel, type Model } from '@/app/types/model'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { DrawBatch, supportDofs } from './draw'
import { deriveProperties, templateOf } from './properties'
import { bayAt, bayLines, gridPoints, pickSnap, snapPoints } from './snap'

const model3d = (): Model => ({ ...emptyModel(), config: { ndm: 3, ndf: 6 } })
const elastic = { eleType: 'ElasticBeamColumn', args: { A: 0.1, E: 200e9, G: 80e9, J: 1e-4, Iy: 1e-4, Iz: 2e-4 } }
const grids = [
  { id: 1, label: '1', start: [0, 0], end: [0, 10] }, { id: 2, label: '2', start: [6, 0], end: [6, 10] },
  { id: 3, label: 'A', start: [0, 0], end: [6, 0] }, { id: 4, label: 'B', start: [0, 5], end: [6, 5] },
]
const levels = [{ id: 1, label: 'L1', height: 3 }, { id: 2, label: 'L2', height: 3 }]

describe('DrawBatch', () => {
  it('merges nodes, reuses transforms by orientation and skips duplicates', () => {
    const b = new DrawBatch(model3d())
    b.member(elastic, [0, 0, 0], [0, 0, 3]) // column
    b.member(elastic, [0, 0, 3], [6, 0, 3]) // beam: new node at its far end only
    b.member(elastic, [6, 0, 0], [6, 0, 3]) // second column: reuses the column transform
    expect(b.member(elastic, [6, 0, 3], [0, 0, 3])).toBeNull() // already there (reversed)
    expect(b.model.nodes.size).toBe(4)
    expect(b.model.elements.size).toBe(3)
    expect(b.model.geomTransfs.size).toBe(2)
    const [c1, beam, c2] = [...b.model.elements.values()]
    expect(c1.args.transfTag).toBe(c2.args.transfTag)
    expect(b.model.geomTransfs.get(Number(c1.args.transfTag))!.args.vecxz).toEqual([1, 0, 0])
    expect(b.model.geomTransfs.get(Number(beam.args.transfTag))!.args.vecxz).toEqual([0, 0, 1])
  })

  it('a zero-length member is skipped; a truss gets no transform', () => {
    const b = new DrawBatch(model3d())
    expect(b.member(elastic, [1, 1, 1], [1, 1, 1])).toBeNull()
    b.member({ eleType: 'Truss', args: { A: 1, matTag: 1 } }, [0, 0, 0], [1, 0, 0])
    expect([...b.model.elements.values()][0].args.transfTag).toBeUndefined()
    expect(b.model.geomTransfs.size).toBe(0)
  })

  it('support presets', () => {
    expect(supportDofs('fixed', 3, 6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(supportDofs('pinned', 3, 6)).toEqual([1, 2, 3])
    expect(supportDofs('roller', 2, 3)).toEqual([2])
  })
})

describe('deriveProperties', () => {
  it('groups by element type and args, ignoring the transform', () => {
    let m = model3d()
    const b = new DrawBatch(m)
    b.member(elastic, [0, 0, 0], [0, 0, 3])
    b.member(elastic, [0, 0, 3], [6, 0, 3])
    b.member({ ...elastic, args: { ...elastic.args, A: 0.2 } }, [6, 0, 3], [6, 0, 0])
    for (const w of b.writes) m = applyModelWrite(m, w)
    const props = deriveProperties(m)
    expect(props.map((p) => p.elementIds.length)).toEqual([2, 1])
    expect(props[0].name).toBe('Elastic A=0.1 I=0.0002')
    expect(templateOf([...m.elements.values()][0])).toEqual(elastic)
  })
})

describe('snapping and bays', () => {
  const project = (p: number[]) => ({ x: p[0] * 100, y: -p[1] * 100 }) // plan view, 100 px per unit
  it('prefers a node over a grid point within the radius', () => {
    const m = model3d()
    m.nodes.set(1, { id: 1, coords: [0.05, 0, 3] })
    const pts = snapPoints(m.nodes, m.elements, gridPoints(grids, [3], 3))
    expect(pts.filter((p) => p.kind === 'grid')).toHaveLength(4)
    expect(pickSnap(pts, project, { x: 2, y: 0 }, 12)?.kind).toBe('node')
    expect(pickSnap(pts, project, { x: 600, y: -495 }, 12)?.p).toEqual([6, 5, 3])
    expect(pickSnap(pts, project, { x: 300, y: -300 }, 12)).toBeNull()
  })

  it('finds the plan bay under the cursor', () => {
    const lines = bayLines('beam', { kind: 'plan', level: 0 }, grids, levels, 3)
    expect(bayAt(lines, [3, 0.02, 3], project, { x: 300, y: -2 }, 12)).toEqual([[0, 0, 3], [6, 0, 3]])
    expect(bayAt(lines, [3, 2, 3], project, { x: 300, y: -200 }, 12)).toBeNull()
  })

  it('elevation columns run level to level at the crossing grids', () => {
    const cols = bayLines('column', { kind: 'elevation', gridId: 3 }, grids, levels, 3)
    expect(cols.map((c) => c.origin[0])).toEqual([0, 6])
    expect(cols[0].stops).toEqual([0, 3, 6])
  })
})
