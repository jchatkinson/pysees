import { describe, expect, it } from 'vitest'
import { dragRect, polylineInRect, segmentHitsRect } from './selectRect'

const r = { minX: 0, minY: 0, maxX: 10, maxY: 10 }

describe('selectRect', () => {
  it('drag direction picks window or crossing', () => {
    expect(dragRect(0, 0, 10, 5)).toEqual({ rect: { minX: 0, minY: 0, maxX: 10, maxY: 5 }, exclusive: true })
    expect(dragRect(10, 5, 0, 0).exclusive).toBe(false)
  })

  it('segment hits', () => {
    expect(segmentHitsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, r)).toBe(true) // passes through, both ends outside
    expect(segmentHitsRect({ x: 2, y: 2 }, { x: 3, y: 3 }, r)).toBe(true) // fully inside
    expect(segmentHitsRect({ x: -5, y: -1 }, { x: 15, y: -1 }, r)).toBe(false) // below
    expect(segmentHitsRect({ x: -1, y: 10.5 }, { x: 2, y: 7.5 }, r)).toBe(true) // enters across the top edge
    expect(segmentHitsRect({ x: -5, y: 9 }, { x: 2, y: 20 }, r)).toBe(false) // misses the corner
  })

  it('window needs every vertex inside; crossing any edge', () => {
    const beam = [{ x: 2, y: 2 }, { x: 20, y: 2 }]
    expect(polylineInRect(beam, false, r, true)).toBe(false)
    expect(polylineInRect(beam, false, r, false)).toBe(true)
    expect(polylineInRect([{ x: 2, y: 2 }, { x: 8, y: 2 }], false, r, true)).toBe(true)
  })

  it('crossing a shell from inside selects it', () => {
    const big = [{ x: -10, y: -10 }, { x: 20, y: -10 }, { x: 20, y: 20 }, { x: -10, y: 20 }]
    expect(polylineInRect(big, true, r, false)).toBe(true)
    expect(polylineInRect(big, false, r, false)).toBe(false) // open polyline around it: no edge touches
  })
})
