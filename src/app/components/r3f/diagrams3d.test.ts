import { describe, expect, it } from 'vitest'
import { fillDiagram, type DiagramArrays } from './diagrams'
import { createNodeDisplacements, fillDeformedSegments } from './displaced'
import { buildSceneIndex } from './sceneIndex'
import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { ElementEntity, GeomTransfEntity, NodeEntity } from '@/app/types/model'

const FORCE_LABELS = ['Ni', 'Vyi', 'Vzi', 'Ti', 'Myi', 'Mzi', 'Nj', 'Vyj', 'Vzj', 'Tj', 'Myj', 'Mzj', 'wx', 'wy', 'wz']

/** One horizontal 3D beam of length L along X (vecxz = Z, so local y = global Y and local z = global Z), with its recorded forces. */
function beam(L: number, force: Record<string, number>) {
  const nodes = new Map<number, NodeEntity>([[1, { id: 1, coords: [0, 0, 0] }], [2, { id: 2, coords: [L, 0, 0] }]])
  const elements = new Map<number, ElementEntity>([[1, { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { transfTag: 1 } }]])
  const geomTransfs = new Map<number, GeomTransfEntity>([[1, { id: 1, transfType: 'Linear', args: { vecxz: [0, 0, 1] } }]])
  const index = buildSceneIndex(nodes, elements, geomTransfs, 3)
  const layout = { columns: { disp: new Map(), reaction: new Map(), force: new Map([[1, { offset: 0, labels: FORCE_LABELS }]]) } } as unknown as RunLayout
  const row = Float64Array.from(FORCE_LABELS.map((l) => force[l] ?? 0))
  const out: DiagramArrays = { fill: new Float32Array(index.segmentCount * 18), fillColor: new Float32Array(index.segmentCount * 18), lines: new Float32Array((index.segmentCount + 2) * 6) }
  return { index, layout, row, out }
}

describe('3D force diagrams', () => {
  // Simply supported beam under a downward load w (wz = -w): reactions wL/2 up, mid-span sagging moment wL²/8.
  const L = 4, w = 10
  const sagging = { wz: -w, Vzi: (w * L) / 2, Vzj: (w * L) / 2 }

  it('draws My on the x–z plane, sagging below the member (tension side)', () => {
    const { index, layout, row, out } = beam(L, sagging)
    const r = fillDiagram(index, layout, row, 'momentY', 1, out)
    const mid = r.labels.find((l) => Math.abs(l.position[0] - L / 2) < 1e-6)!
    expect(mid.value).toBeCloseTo((w * L * L) / 8, 6)
    expect(mid.position[2]).toBeCloseTo(-(w * L * L) / 8, 6) // offset against local z (= global Z): below the beam
    expect(mid.position[1]).toBeCloseTo(0, 9)
  })

  it('draws Vz along local z with the same load', () => {
    const { index, layout, row, out } = beam(L, sagging)
    const r = fillDiagram(index, layout, row, 'shearZ', 1, out)
    const ends = r.labels.map((l) => l.value)
    expect(ends[0]).toBeCloseTo((w * L) / 2, 6) // Vz(0) = Vzi
    expect(ends[1]).toBeCloseTo(-(w * L) / 2, 6) // Vz(L) = Vzi + wz L
  })

  it('draws Mz on the x–y plane for a transverse load in y', () => {
    const { index, layout, row, out } = beam(L, { wy: -w, Vyi: (w * L) / 2, Vyj: (w * L) / 2 })
    const r = fillDiagram(index, layout, row, 'moment', 1, out)
    const mid = r.labels.find((l) => Math.abs(l.position[0] - L / 2) < 1e-6)!
    expect(mid.value).toBeCloseTo((w * L * L) / 8, 6)
    expect(mid.position[1]).toBeCloseTo(-(w * L * L) / 8, 6)
    expect(mid.position[2]).toBeCloseTo(0, 9)
  })

  it('draws a constant torsion diagram from Ti', () => {
    const { index, layout, row, out } = beam(L, { Ti: -7 })
    const r = fillDiagram(index, layout, row, 'torsion', 1, out)
    expect(r.labels.map((l) => l.value)).toEqual([7, 7])
  })
})

describe('3D deformed shape', () => {
  it('bends in x–z from the y rotation (dw/dx = -θy)', () => {
    const { index } = beam(2, {})
    const nd = createNodeDisplacements(2)
    // Node 1 rotates about y by -0.01 (slope dw/dx = +0.01); nothing else moves, so the cubic rises mid-span by L/8 · (m1 - m2) = 0.0025.
    nd.rot.set([0, -0.01, 0, 0, 0, 0])
    const out = new Float32Array(index.segmentCount * 6)
    fillDeformedSegments(index, nd, 1, out)
    expect(out[4 * 6 + 2]).toBeCloseTo(0.0025, 6) // z of the mid-span station
    expect(out[4 * 6 + 1]).toBeCloseTo(0, 9) // no bending in y
  })

  it('bends in x–y from the z rotation (dv/dx = θz)', () => {
    const { index } = beam(2, {})
    const nd = createNodeDisplacements(2)
    nd.rot.set([0, 0, 0.01, 0, 0, 0])
    const out = new Float32Array(index.segmentCount * 6)
    fillDeformedSegments(index, nd, 1, out)
    expect(out[4 * 6 + 1]).toBeCloseTo(0.0025, 6)
  })
})
