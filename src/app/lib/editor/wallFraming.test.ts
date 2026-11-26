import { describe, expect, it } from 'vitest'
import type { WallLayoutSpec } from '@/app/carapace/wasm/carapace_wasm'
import { framingUnit, wallFraming, type FramingBox } from './wallFraming'

const ea = 9500 * 38 * 140
const layout = (extra: Partial<WallLayoutSpec> = {}): WallLayoutSpec => ({
  length: 3600, height: 2400, studs: [0, 400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600].map((x) => ({ x, ea: x === 0 || x === 3600 ? 3 * ea : ea })),
  topEa: 2 * ea, topEi: undefined, topDistribution: 'beam', bottomEa: ea, bottomEi: 1, sheathing: { law: { kind: 'linear', ga: 11000 } }, ...extra,
})
const of = (boxes: FramingBox[], part: string) => boxes.filter((b) => b.part === part)

describe('wallFraming', () => {
  it('frames a plain wall: plates, built-up end posts, studs and seamed sheathing', () => {
    const boxes = wallFraming(layout(), 3600, 2400, 'mm')
    expect(of(boxes, 'plate')).toHaveLength(3)
    const studs = of(boxes, 'stud')
    expect(studs).toHaveLength(10)
    expect(studs[0]).toMatchObject({ x0: 0, x1: 114, y0: 38, y1: 2400 - 76 })
    expect(studs.at(-1)).toMatchObject({ x0: 3600 - 114, x1: 3600 })
    for (const b of boxes) { expect(b.x0).toBeGreaterThanOrEqual(0); expect(b.x1).toBeLessThanOrEqual(3600); expect(b.y1).toBeLessThanOrEqual(2400) }
    expect(of(boxes, 'sheathing')).toHaveLength(3) // seams at 1220 and 2440
    expect(of(boxes, 'sheathing')[0].z0).toBe(70)
  })

  it('frames openings: jacks, header, cripples, sill, a cut bottom plate for a door, and holes in the sheathing', () => {
    const studs = [0, 400, 1000, 1200, 1400, 2000, 2400, 3000, 3200, 3600].map((x) => ({ x, ea }))
    const boxes = wallFraming(layout({ studs, openings: [{ x0: 1000, x1: 1400, headHeight: 2000, headerEi: 1, jackEa: ea, door: true }, { x0: 2400, x1: 3200, headHeight: 2000, headerEi: 1, jackEa: 2 * ea, door: false }] }), 3600, 2400, 'mm')
    expect(of(boxes, 'header')).toEqual([expect.objectContaining({ x0: 1019, x1: 1381, y0: 2000, y1: 2235 }), expect.objectContaining({ x0: 2419, x1: 3181 })])
    const bottom = of(boxes, 'plate').filter((b) => b.y0 === 0)
    expect(bottom.map((b) => [b.x0, b.x1])).toEqual([[0, 1057], [1343, 3600]])
    expect(of(boxes, 'plate').some((b) => b.y1 === 800 && b.x0 === 2419 + 76)).toBe(true) // window sill between double jacks
    const cripples = of(boxes, 'stud').filter((b) => b.x0 === 1200 - 19 || b.x0 === 3000 - 19)
    expect(cripples.map((b) => [b.y0, b.y1])).toEqual([[2235, 2324], [2235, 2324], [38, 762]]) // door: above only; window: above and below
    const skin = of(boxes, 'sheathing')
    expect(skin.some((b) => b.x0 >= 1057 && b.x1 <= 1343 && b.y0 < 2000)).toBe(false)
    expect(skin.some((b) => b.x0 >= 2495 && b.x1 <= 3105 && b.y0 < 800 && b.y1 > 800)).toBe(false)
  })

  it('adds a rim board and subfloor in the floor zone, and sizes lumber in the model unit', () => {
    const boxes = wallFraming(layout({ floor: { depth: 300, ga: 1, rimEa: 1 } }), 3600, 2700, 'mm')
    expect(of(boxes, 'rim')).toEqual([expect.objectContaining({ y0: 2400, y1: 2681, z0: 32, z1: 70 })])
    expect(of(boxes, 'subfloor')).toEqual([expect.objectContaining({ y0: 2681, y1: 2700 })])
    const inches = wallFraming(layout({ length: 144, height: 96, studs: [0, 16, 128, 144].map((x) => ({ x, ea })) }), 144, 96, 'in')
    expect(of(inches, 'stud')[1].x1 - of(inches, 'stud')[1].x0).toBeCloseTo(38 / 25.4)
    expect([framingUnit(undefined, 2700), framingUnit(undefined, 96), framingUnit(undefined, 9), framingUnit(undefined, 2.7), framingUnit('ft', 2700)]).toEqual(['mm', 'in', 'ft', 'm', 'ft'])
  })
  it('sizes members from the lumber framing: plies, header depth, sill, rim', () => {
    const studs = [0, 400, 1000, 1400, 3600].map((x) => ({ x, ea }))
    const boxes = wallFraming(layout({ studs, floor: { depth: 300, ga: 1, rimEa: 1 }, openings: [{ x0: 1000, x1: 1400, headHeight: 2000, headerEi: 1, jackEa: ea, door: false }] }), 3600, 2700, 'mm',
      { grade: 'o86-spf', stud: '2x4', endPlies: 2, topPlies: 1, bottomPlies: 2, headerGrade: 'lvl', rim: { size: 'rim32', plies: 1, grade: 'o86-spf' }, openings: [{ header: 'lvl12', headerPlies: 1, jackPlies: 2, sill: 1000 }] })
    expect(of(boxes, 'plate').filter((b) => b.y1 <= 76 + 1e-9 && b.x1 - b.x0 > 1000)).toHaveLength(1) // a double bottom plate, one box 0..76
    expect(of(boxes, 'stud')[0]).toMatchObject({ x0: 0, x1: 76, y0: 76, y1: 2400 - 38, z0: -44.5, z1: 44.5 })
    expect(of(boxes, 'header')[0]).toMatchObject({ y0: 2000, y1: 2302 })
    expect(of(boxes, 'plate').some((b) => b.y1 === 1000)).toBe(true)
    expect(of(boxes, 'rim')[0]).toMatchObject({ z0: 44.5 - 32, z1: 44.5 })
  })
  it('tags the boxes that draw recorded members (studs, jacks, cripples over a header)', () => {
    const studs = [0, 400, 1000, 1200, 1400, 2000, 3600].map((x) => ({ x, ea }))
    const boxes = wallFraming(layout({ studs, openings: [{ x0: 1000, x1: 1400, headHeight: 2000, headerEi: 1, jackEa: ea, door: false }] }), 3600, 2400, 'mm')
    const tagged = boxes.filter((b) => b.member).map((b) => `${b.member!.kind}@${b.member!.x}`)
    expect(tagged.sort()).toEqual(['cripple@1200', 'jack@1000', 'jack@1400', 'stud@0', 'stud@1000', 'stud@1400', 'stud@2000', 'stud@3600', 'stud@400'].sort())
    expect(boxes.filter((b) => !b.member && b.part === 'stud')).toHaveLength(1) // the cripple below the sill has no recorded force
  })
})
