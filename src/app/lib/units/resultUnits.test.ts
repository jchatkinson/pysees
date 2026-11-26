import { describe, expect, it } from 'vitest'
import { makeUnitContext } from './units'
import { resultUnit, withUnit } from './resultUnits'

const u = makeUnitContext({ length: 'mm', force: 'N', time: 's' }, { length: 'm', force: 'kN' })

describe('resultUnit', () => {
  it('converts each result type to its display unit', () => {
    const at = (type: Parameters<typeof resultUnit>[1], contour: Parameters<typeof resultUnit>[2] = 'Nx') => { const r = resultUnit(u, type, contour); return [r.toDisplay(1e6), r.symbol] }
    expect(at('deformed')).toEqual([1e3, 'm'])
    expect(at('axial')).toEqual([1e3, 'kN'])
    expect(at('shearZ')).toEqual([1e3, 'kN'])
    expect(at('torsion')).toEqual([1, 'kN·m'])
    expect(at('moment')).toEqual([1, 'kN·m'])
    expect(at('contour', 'Qx')).toEqual([1e6, 'kN/m'])
    const [m, sym] = at('contour', 'Mx')
    expect(m).toBeCloseTo(1e3)
    expect(sym).toBe('kN·m/m')
  })
  it('labels nothing in a unitless model', () => {
    const r = resultUnit(makeUnitContext(undefined), 'moment', 'Nx')
    expect([r.toDisplay(5), r.symbol]).toEqual([5, ''])
    expect(withUnit('5', r.symbol)).toBe('5')
  })
})
