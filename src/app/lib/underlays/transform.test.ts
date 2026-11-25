import { describe, expect, it } from 'vitest'
import { aligned, calibrated, cropFrom, fromTwoPoints, parseDrawingScale, pdfToWorld, scaleFromRatio, worldToPdf, type P2 } from './transform'

const close = (a: P2, b: P2) => { expect(a[0]).toBeCloseTo(b[0], 9); expect(a[1]).toBeCloseTo(b[1], 9) }

describe('underlay transform', () => {
  const u = { origin: [3, -2] as P2, scale: 0.05, rotation: 0.4 }
  it('worldToPdf inverts pdfToWorld', () => { close(worldToPdf(u, pdfToWorld(u, [120, 75])), [120, 75]) })
  it('fromTwoPoints maps both pairs', () => {
    const a: P2 = [100, 50], b: P2 = [700, 410], wa: P2 = [0, 0], wb: P2 = [30, 0]
    const t = fromTwoPoints(a, b, wa, wb)!
    close(pdfToWorld(t, a), wa); close(pdfToWorld(t, b), wb)
    expect(fromTwoPoints(a, a, wa, wb)).toBeNull()
  })
  it('parses printed scales', () => {
    expect(parseDrawingScale('1:100')).toBe(100)
    expect(parseDrawingScale('1/8" = 1\'-0"')).toBe(96)
    expect(parseDrawingScale('3/16"=1\'')).toBe(64)
    expect(parseDrawingScale('1" = 20\'')).toBe(240)
    expect(parseDrawingScale('1 1/2" = 1\'-0"')).toBe(8)
    expect(parseDrawingScale('1/4" = 1\'-6"')).toBe(72)
    expect(parseDrawingScale('nonsense')).toBeNull()
  })
  it('converts a printed scale to world units per point', () => {
    // 1/8" = 1'-0": 72 pt of paper (1 in) is 8 ft = 96 in.
    expect(72 * scaleFromRatio(96, 'in')).toBeCloseTo(96, 9)
    expect(72 * scaleFromRatio(96, 'ft')).toBeCloseTo(8, 9)
    // 1:100: 1 in of paper is 2.54 m.
    expect(72 * scaleFromRatio(100, 'm')).toBeCloseTo(2.54, 9)
    // docs/example-pdf.pdf: a 36 x 24 in sheet (2592 x 1728 pt) at 1/4" = 1'-0" spans 144 x 96 ft.
    const s = scaleFromRatio(parseDrawingScale('1/4" = 1\'-0"')!, 'ft')
    expect(2592 * s).toBeCloseTo(144, 9); expect(1728 * s).toBeCloseTo(96, 9)
  })
  it('calibrates the scale about the first pick', () => {
    const a = pdfToWorld(u, [100, 100]), b = pdfToWorld(u, [400, 500])
    const c = calibrated(u, a, b, 10)!
    close(pdfToWorld(c, [100, 100]), a)
    const b2 = pdfToWorld(c, [400, 500])
    expect(Math.hypot(b2[0] - a[0], b2[1] - a[1])).toBeCloseTo(10, 9)
    expect(c.rotation).toBe(u.rotation)
  })
  it('aligns by one pair (move), two pairs, or two pairs keeping scale', () => {
    const s1 = pdfToWorld(u, [50, 60]), s2 = pdfToWorld(u, [650, 60])
    const moved = aligned(u, s1, [10, 10])!
    close(pdfToWorld(moved, [50, 60]), [10, 10]); expect(moved.scale).toBe(u.scale); expect(moved.rotation).toBe(u.rotation)
    const full = aligned(u, s1, [0, 0], s2, [0, 40])!
    close(pdfToWorld(full, [50, 60]), [0, 0]); close(pdfToWorld(full, [650, 60]), [0, 40])
    const kept = aligned(u, s1, [0, 0], s2, [0, 40], true)!
    close(pdfToWorld(kept, [50, 60]), [0, 0]); expect(kept.scale).toBe(u.scale); expect(kept.rotation).toBeCloseTo(Math.PI / 2, 9)
  })
  it('crops to the picked rectangle, clipped to the page', () => {
    const r = cropFrom(u, [800, 600], pdfToWorld(u, [700, 100]), pdfToWorld(u, [-50, 300]))!
    r.forEach((v, i) => expect(v).toBeCloseTo([0, 100, 700, 300][i], 9))
    expect(cropFrom(u, [800, 600], pdfToWorld(u, [10, 10]), pdfToWorld(u, [10, 90]))).toBeNull()
  })
})
