import { describe, expect, it } from 'vitest'
import { emptyModel, type Model } from '@/app/types/model'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { DrawBatch } from './draw'
import { copySelection, divideMembers, mergeNodes, mirror, moveSelection, translate } from './edit'

const elastic = { eleType: 'ElasticBeamColumn', args: { A: 0.1, E: 200e9, G: 80e9, J: 1e-4, Iy: 1e-4, Iz: 2e-4 } }
/** A column and a beam: nodes 1 (0,0,0, fixed), 2 (0,0,3), 3 (6,0,3); elements 1 (column), 2 (beam) with a uniform load. */
function frame(): Model {
  const b = new DrawBatch({ ...emptyModel(), config: { ndm: 3, ndf: 6 } })
  b.member(elastic, [0, 0, 0], [0, 0, 3]); b.member(elastic, [0, 0, 3], [6, 0, 3])
  b.support(1, [1, 2, 3, 4, 5, 6])
  let m = b.model
  m = applyModelWrite(m, { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: {}, children: [{ kind: 'eleLoad', args: { eleTags: [2], wz: -10 } }, { kind: 'load', args: { nodeTag: 3, values: [1, 0, 0, 0, 0, 0] } }] } })
  return m
}

describe('edit operations', () => {
  it('moves only the selection’s nodes', () => {
    const m = moveSelection(frame(), { nodes: [], elements: [2] }, translate([0, 0, 1]))
    expect(m.nodes.get(2)!.coords).toEqual([0, 0, 4])
    expect(m.nodes.get(1)!.coords).toEqual([0, 0, 0])
  })

  it('replicates with merged nodes, copied supports, and skips existing members', () => {
    const { model, elements } = copySelection(frame(), { nodes: [], elements: [1, 2] }, translate([6, 0, 0]), 2)
    expect(elements).toHaveLength(4)
    expect(model.nodes.size).toBe(3 + 2 * 3 - 2) // each copy reuses the previous copy's far node... node 3 is the first copy's column top
    expect([...model.fixes.keys()]).toHaveLength(3)
  })

  it('mirrors across a plane', () => {
    const { model } = copySelection(frame(), { nodes: [], elements: [2] }, mirror(0, 0))
    expect([...model.nodes.values()].some((n) => n.coords[0] === -6 && n.coords[2] === 3)).toBe(true)
  })

  it('divides a member and moves its element load to the parts', () => {
    const { model, elements } = divideMembers(frame(), [2], 3)
    expect(elements).toHaveLength(3)
    expect(elements[0]).toBe(2)
    expect(model.nodes.size).toBe(5)
    expect(model.patterns.get(1)!.children[0].args.eleTags).toEqual(elements)
  })

  it('merges coincident nodes, moving members, supports and loads', () => {
    let m = frame()
    m = applyModelWrite(m, { kind: 'node', entity: { id: 9, coords: [6, 0, 3 + 1e-9] } })
    m = applyModelWrite(m, { kind: 'fix', entity: { nodeId: 9, dofs: [3] } })
    m = applyModelWrite(m, { kind: 'element', entity: { id: 9, eleType: 'ElasticBeamColumn', nodes: [2, 9], args: { ...elastic.args } } }) // duplicate of the beam once merged
    const { model, merged } = mergeNodes(m)
    expect(merged).toBe(1)
    expect(model.nodes.has(9)).toBe(false)
    expect(model.elements.has(9)).toBe(false)
    expect(model.fixes.get(3)!.dofs).toEqual([3])
  })
})

describe('shell cells', async () => {
  const { cellAt, meshQuad } = await import('./snap')
  const grids = [
    { id: 1, label: '1', start: [0, 0], end: [0, 10] }, { id: 2, label: '2', start: [6, 0], end: [6, 10] },
    { id: 3, label: 'A', start: [0, 0], end: [6, 0] }, { id: 4, label: 'B', start: [0, 5], end: [6, 5] },
  ]
  const levels = [{ id: 1, label: 'L1', height: 3 }, { id: 2, label: 'L2', height: 3 }]
  it('finds the plan cell and the elevation panel under a point', () => {
    expect(cellAt({ kind: 'plan', level: 1 }, grids, levels, [2, 2, 6])).toEqual([[0, 0, 6], [6, 0, 6], [6, 5, 6], [0, 5, 6]])
    expect(cellAt({ kind: 'plan', level: 1 }, grids, levels, [7, 2, 6])).toBeNull()
    expect(cellAt({ kind: 'elevation', gridId: 3 }, grids, levels, [3, 0, 4])).toEqual([[0, 0, 3], [6, 0, 3], [6, 0, 6], [0, 0, 6]])
  })
  it('meshes a quad', () => {
    const q = meshQuad([[0, 0, 0], [4, 0, 0], [4, 2, 0], [0, 2, 0]], 2, 1)
    expect(q).toEqual([[[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]], [[2, 0, 0], [4, 0, 0], [4, 2, 0], [2, 2, 0]]])
  })
})
