import { describe, expect, it } from 'vitest'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { chordsAt, floorFramingBoxes, floorJoists, floorTakedown, floorTransferRows, stripReactions, type JoistFloorArgs } from './floors'

// Three walls along Y under the floor (x = 0, 4000, 8000; 6000 long, top at z = 2440), and an L-shaped floor whose joists run along X.
function lFloor(angle = 0, spacing = 400) {
  const writes: ModelWrite[] = []
  let n = 0
  const node = (x: number, y: number, z: number) => { writes.push({ kind: 'node', entity: { id: ++n, coords: [x, y, z] } }); return n }
  const wall = (id: number, x: number) => {
    const ids = [node(x, 0, 0), node(x, 6000, 0), node(x, 6000, 2440), node(x, 0, 2440)]
    writes.push({ kind: 'element', entity: { id, eleType: 'studWall', nodes: ids, args: {} } })
  }
  wall(1, 0); wall(2, 4000); wall(3, 8000)
  const outline = [[0, 0], [8000, 0], [8000, 3000], [4000, 3000], [4000, 6000], [0, 6000]].map(([x, y]) => node(x, y, 2440))
  const args: JoistFloorArgs = { angle, spacing, joist: { grade: 'o86-spf', size: '2x10', plies: 1 }, continuity: 'simple' }
  writes.push({ kind: 'element', entity: { id: 10, eleType: 'joistFloor', nodes: outline, args: args as unknown as Record<string, unknown> } })
  const model = modelFromWrites(3, 6, writes)
  return { ...model, config: { ...model.config!, units: { length: 'mm' as const, force: 'N' as const, time: 's' as const } } }
}

describe('joist floors', () => {
  it('cuts a concave outline into chords', () => {
    const u: [number, number][] = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]]
    expect(chordsAt(u, 1)).toEqual([[0, 10]])
    expect(chordsAt(u, 5)).toEqual([[0, 3], [7, 10]])
  })

  // Each joist strip spans edge to edge of the L and bears on the walls it crosses there; the load is the strip's tributary area.
  it('transfers an L-shaped floor strip by strip to the walls under it', () => {
    const model = lFloor(0, 375) // strips line up with the L's step at y = 3000
    const { rows, problems } = floorTransferRows(model, 10, [{ kind: 'area', w: 0.002 }])
    expect(problems).toEqual([])
    expect(rows).toHaveLength(16)
    const wide = rows.filter((r) => r.bounds[3] <= 3000), narrow = rows.filter((r) => r.bounds[2] >= 3000)
    expect(wide).toHaveLength(8); expect(narrow).toHaveLength(8)
    for (const r of wide) expect(r.supports.map((s) => s.wall).sort()).toEqual([1, 2, 3])
    for (const r of narrow) expect(r.supports.map((s) => s.wall).sort()).toEqual([1, 2])
    const total = rows.reduce((sum, r) => sum + 0.002 * (r.bounds[1] - r.bounds[0]) * (r.bounds[3] - r.bounds[2]), 0)
    expect(total).toBeCloseTo(0.002 * (8000 * 3000 + 4000 * 3000), 6)
    // The strip's width lands on the wall where the joist line crosses it (wall-local x = plan y here).
    const r = rows[3], sup = r.supports[0]
    expect(sup.reversed).toBe(false)
    expect(sup.xAtT0).toBeCloseTo(r.bounds[2], 9)
  })

  it('reports strips with fewer than two bearing walls', () => {
    const { rows, problems } = floorTransferRows(lFloor(90), 10, [{ kind: 'area', w: 1 }])
    expect(rows).toEqual([])
    expect(problems[0]).toMatch(/fewer than two walls or beams/)
  })
})

describe('floor takedown', () => {
  // Hand results: two equal spans continuous → 3/8, 10/8, 3/8 wL; simple → 1/2, 1, 1/2; an overhang a relieves the back support.
  it('matches hand reactions for simple, continuous and overhanging strips', () => {
    const r = (x: number[]) => x.map((v) => Number(v.toFixed(9)))
    expect(r(stripReactions([0, 4, 8], 0, 8, 1, true))).toEqual([1.5, 5, 1.5])
    expect(r(stripReactions([0, 4, 8], 0, 8, 1, false))).toEqual([2, 4, 2])
    expect(r(stripReactions([0, 4], 0, 5, 1, false))).toEqual([r([4 / 2 - 0.5 / 4])[0], r([4 / 2 + 0.5 / 4 + 1])[0]])
    const three = stripReactions([0, 3, 6, 9], 0, 9, 1, true) // 0.4, 1.1, 1.1, 0.4 × wL
    expect(r(three)).toEqual([1.2, 3.3, 3.3, 1.2])
  })

  it('totals the L-shaped floor onto its walls', () => {
    const model = lFloor(0, 375)
    const t = floorTakedown(model, 10, new Map([[1, 0.002]]))
    const total = [...t.values()].reduce((s, m) => s + (m.get(1) ?? 0), 0)
    expect(total).toBeCloseTo(0.002 * (8000 * 3000 + 4000 * 3000), 6)
    // Wall 3 (x = 8000) carries half the 4000-wide span over the 3000-deep wing only.
    expect(t.get(3)!.get(1)).toBeCloseTo(0.002 * 2000 * 3000, 6)
  })
})

describe('floor framing for drawing', () => {
  // L floor, joists along X every 375 mm from y = 0 to 6000: 17 joist lines (the wing ends at y = 3000). Rims on the three edges no wall carries.
  it('lays joists across the outline and rims on edges without a wall', () => {
    const model = lFloor(0, 375)
    const e = model.elements.get(10)!
    expect(floorJoists(model, e)!.lines).toHaveLength(17)
    const fr = floorFramingBoxes(model, { ...e, args: { ...e.args, subfloor: 19 } })!
    const joists = fr.boxes.filter((b) => b.part === 'joist'), rims = fr.boxes.filter((b) => b.part === 'rim')
    expect(joists).toHaveLength(17)
    expect(joists.map((b) => b.s1 - b.s0)).toEqual([...Array(8).fill(8000), ...Array(9).fill(4000)])
    for (const b of joists) { expect(b.z1).toBeCloseTo(2440 - 19, 9); expect(b.z1 - b.z0).toBeCloseTo(235, 9); expect(b.t1 - b.t0).toBeCloseTo(38, 9) }
    expect(rims).toHaveLength(3)
    // Every rim lies inside the outline.
    for (const r of rims) expect([r.t0, r.t1].every((t) => t >= -1e-9 && t <= 6000 + 1e-9)).toBe(true)
    expect(fr.slab).toMatchObject({ z0: 2421, z1: 2440 })
  })

  // A joist floor between a wall (x = 0) and a beam (x = 4000) with a 1000 overhang past the beam: strips that bear on the beam are solved
  // in PySees, wall share as a top-line load, beam share split onto the beam's nodes by position.
  it('bears on beams: lever-rule reactions, the beam share on its nodes', () => {
    const writes: ModelWrite[] = []
    let n = 0
    const node = (x: number, y: number, z: number) => { writes.push({ kind: 'node', entity: { id: ++n, coords: [x, y, z] } }); return n }
    const w = [node(0, 0, 0), node(0, 2000, 0), node(0, 2000, 2440), node(0, 0, 2440)]
    writes.push({ kind: 'element', entity: { id: 1, eleType: 'studWall', nodes: w, args: {} } })
    const b0 = node(4000, 0, 2440), b1 = node(4000, 2000, 2440)
    writes.push({ kind: 'element', entity: { id: 2, eleType: 'ElasticBeamColumn', nodes: [b0, b1], args: {} } })
    const outline = [[0, 0], [5000, 0], [5000, 2000], [0, 2000]].map(([x, y]) => node(x, y, 2440))
    const args: JoistFloorArgs = { angle: 0, spacing: 400, joist: { grade: 'o86-spf', size: '2x10', plies: 1 }, continuity: 'simple' }
    writes.push({ kind: 'element', entity: { id: 10, eleType: 'joistFloor', nodes: outline, args: args as unknown as Record<string, unknown> } })
    const model = modelFromWrites(3, 6, writes)
    const t = floorTransferRows(model, 10, [{ kind: 'area', w: 0.002 }])
    expect(t.rows).toEqual([])
    expect(t.problems).toEqual([])
    expect(t.strips).toBe(5) // counted although none went to Carapace
    // Per unit width: span 4000, overhang 1000 → beam 0.002·5000·2500/4000, wall the rest.
    const beam = 0.002 * 5000 * 2500 / 4000 * 2000, wall = 0.002 * 5000 * 2000 - beam
    expect(t.wallLines.reduce((sum, l) => sum + l.q * (l.x1 - l.x0), 0)).toBeCloseTo(wall, 6)
    expect(t.nodal.reduce((sum, v) => sum + v.fz, 0)).toBeCloseTo(beam, 6)
    expect(t.nodal.find((v) => v.node === b0)!.fz).toBeCloseTo(beam / 2, 6) // symmetric about the beam's mid-length
    const td = floorTakedown(model, 10, new Map([[1, 0.002]]))
    expect(td.get(1)!.get(1)).toBeCloseTo(wall, 6)
    expect(td.get(2)!.get(1)).toBeCloseTo(beam, 6)
  })
})
