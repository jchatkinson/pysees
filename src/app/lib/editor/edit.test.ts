import { describe, expect, it } from 'vitest'
import { emptyModel, type Model } from '@/app/types/model'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { DrawBatch } from './draw'
import { assignDiaphragms, copySelection, divideMembers, mergeNodes, mirror, moveSelection, removeDiaphragms, translate } from './edit'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { deleteEntity } from '@/app/lib/modelWrite'

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

  it('assigns one diaphragm per level at the centroid, skipping supported nodes, and removes it with its retained node', () => {
    const b = new DrawBatch({ ...emptyModel(), config: { ndm: 3, ndf: 6 } })
    for (const [x, y] of [[0, 0], [6, 0], [6, 4], [0, 4]]) { b.member(elastic, [x, y, 0], [x, y, 3]); b.member(elastic, [x, y, 3], [x, y, 6]) }
    for (const id of [...b.model.nodes.keys()]) if (b.model.nodes.get(id)!.coords[2] === 0) b.support(id, [1, 2, 3, 4, 5, 6])
    const m0 = b.model
    const { model, diaphragms, skipped } = assignDiaphragms(m0, [...m0.nodes.keys()])
    expect(diaphragms).toBe(2)
    expect(skipped).toBe(4)
    const ds = [...model.mpConstraints.values()]
    for (const d of ds) {
      const r = model.nodes.get(Number(d.args.rNodeTag))!
      expect([r.coords[0], r.coords[1]]).toEqual([3, 2])
      expect(model.fixes.get(r.id)!.dofs).toEqual([3, 4, 5])
      expect(d.args.cNodeTags).toHaveLength(4)
    }
    expect(compileInputV1(model, { commands: [], cursor: -1 }).input?.rigidDiaphragms?.retained).toHaveLength(2)
    // Reassigning replaces rather than duplicates; deleting a floor node shrinks its diaphragm.
    expect(assignDiaphragms(model, [...model.nodes.keys()]).model.mpConstraints.size).toBe(2)
    const cut = deleteEntity(model, 'node', Number((ds[0].args.cNodeTags as number[])[0]))
    expect(cut.mpConstraints.get(ds[0].id)!.args.cNodeTags).toHaveLength(3)
    const removed = removeDiaphragms(model, [Number((ds[0].args.cNodeTags as number[])[0])])
    expect(removed.mpConstraints.size).toBe(1)
    expect(removed.nodes.has(Number(ds[0].args.rNodeTag))).toBe(false)
  })
})
