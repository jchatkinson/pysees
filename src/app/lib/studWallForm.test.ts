import { describe, expect, it } from 'vitest'
import { studBuildingSpec } from '@/app/lib/studBuilding'
import { makeUnitContext } from '@/app/lib/units/units'
import { guessFraming, lumberScale } from '@/app/lib/lumber'
import { convertLeft, layoutText, parseLayout } from '@/app/lib/studWallForm'

const u = makeUnitContext({ length: 'mm', force: 'N', time: 's' }, { length: 'ft', force: 'kip' })
const base = studBuildingSpec().spec.storeys[0].walls[0].layout
const scale = lumberScale({ length: 'mm', force: 'N', time: 's' }, base.height)

describe('stud-wall layout form', () => {
  // Untouched fields keep their stored values exactly, even through ft / kip display text.
  it('round-trips an unchanged layout exactly', () => {
    const f = guessFraming(base, scale)
    for (const relative of [false, true]) {
      const init = layoutText(base, f, u, relative)
      const out = parseLayout(base, f, init, init.text, init.openings, u, scale)
      expect(out.layout!.openings).toEqual(base.openings)
      expect(out.layout!.studs).toEqual(base.studs)
      for (const k of ['topEa', 'topEi', 'bottomEa', 'bottomEi'] as const) expect(out.layout![k]).toBeCloseTo(base[k]!, 6)
    }
  })

  // Openings are a left edge and a width; sizes and plies set the stiffnesses; a blank override is the computed value.
  it('parses edits: left + width (absolute or relative), lumber sizes, overrides', () => {
    const plain = { ...base, openings: [] }
    const f = guessFraming(plain, scale)
    const init = layoutText(plain, f, u)
    const opening = { door: false, left: '2', width: '3', head: '7', open: '4', header: '2x8', headerPlies: '3', jackPlies: '2', headerEi: '', jackEa: '' }
    const out = parseLayout(plain, f, init, { ...init.text, stud: '2x4', bottomEa: '20' }, [opening], u, scale)
    const L = out.layout!, ea = 9500 * 38 * 89
    expect(L.studs.map((s) => s.x)).toEqual(expect.arrayContaining([expect.closeTo(609.6, 6), expect.closeTo(1524, 6)]))
    expect(L.studs.find((s) => s.x > 0 && s.x < L.length)!.ea).toBeCloseTo(ea, 3)
    expect(L.openings![0]).toMatchObject({ x0: expect.closeTo(609.6, 6), x1: expect.closeTo(1524, 6), headHeight: expect.closeTo(2133.6, 6), jackEa: expect.closeTo(2 * ea, 3), headerEi: expect.closeTo(3 * 9500 * 38 * 184 ** 3 / 12, 0) })
    expect(out.framing!.openings[0].sill).toBeCloseTo(3 * 304.8, 6)
    expect(L.bottomEa).toBeCloseTo(u.fromDisplay('force', 20), 6)
    const rel = parseLayout(plain, f, init, init.text, [{ ...opening, left: '0.25' }], u, scale, true)
    expect(rel.layout!.openings![0].x0).toBeCloseTo(0.25 * plain.length, 9)
    expect(convertLeft('0.25', false, plain.length, u)).toBe(String(Number(u.toDisplay('length', 0.25 * plain.length).toPrecision(6))))
    expect(parseLayout(plain, f, init, init.text, [{ ...opening, open: '8' }], u, scale).errors).toEqual([expect.stringContaining('opening height')])
  })
})
