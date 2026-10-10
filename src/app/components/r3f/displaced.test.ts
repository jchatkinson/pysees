import { describe, expect, it } from 'vitest'
import { createNodeDisplacements, displaceNodes, fillDeformedSegments } from './displaced'
import { buildSceneIndex } from './sceneIndex'
import type { ElementEntity, GeomTransfEntity, NodeEntity } from '@/app/types/model'

describe('2D deformed members', () => {
  it.each([[2, 0], [0, 2], [1.2, 1.6]])('draws finite cubic segments connected to displaced nodes for end %j', (x, y) => {
    const nodes = new Map<number, NodeEntity>([[1, { id: 1, coords: [0, 0] }], [2, { id: 2, coords: [x, y] }]])
    const elements = new Map<number, ElementEntity>([[1, { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { transfTag: 1 } }]])
    const transfs = new Map<number, GeomTransfEntity>([[1, { id: 1, transfType: 'Linear', args: {} }]])
    const index = buildSceneIndex(nodes, elements, transfs, 2)
    const nd = createNodeDisplacements(2)
    nd.disp.set([0, 0, 0, .02, -.01, 0])
    // Only rz is recorded in 2D; rx and ry intentionally remain NaN.
    nd.rot[2] = .01; nd.rot[5] = 0
    const segments = new Float32Array(index.segmentCount * 6), positions = new Float32Array(6)
    fillDeformedSegments(index, nd, 10, segments)
    displaceNodes(index, nd, 10, positions)
    expect([...segments].every(Number.isFinite)).toBe(true)
    expect([...segments.slice(0, 3)]).toEqual([...positions.slice(0, 3)])
    expect([...segments.slice(-3)]).toEqual([...positions.slice(3)])
    // At midspan, Hermite rotation adds L/8 * rz along the member's local y.
    expect(segments[4 * 6]).toBeCloseTo(x / 2 + .1 - y / 2 * .025, 6)
    expect(segments[4 * 6 + 1]).toBeCloseTo(y / 2 - .05 + x / 2 * .025, 6)
  })
})
