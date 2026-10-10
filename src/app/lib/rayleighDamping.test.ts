import { describe, expect, it } from 'vitest'
import { rayleighDamping } from './rayleighDamping'

describe('Rayleigh anchor periods', () => {
  it.each([[1, .2], [.2, 1], [1, 1]])('gives 5 percent damping at periods %s and %s', (period1, period2) => {
    const d = rayleighDamping({ dampingMode: 'Anchor periods', period1, period2, dampingPercent: 5 })
    expect(d.error).toBeUndefined()
    for (const t of [period1, period2]) {
      const omega = 2 * Math.PI / t
      expect((d.alphaM / omega + d.betaK * omega) / 2).toBeCloseTo(.05, 12)
    }
    expect(d.omega1).toBeCloseTo(2 * Math.PI / period1)
    expect(d.omega2).toBeCloseTo(2 * Math.PI / period2)
  })
  it('preserves legacy coefficients and ignores inactive period settings', () => {
    expect(rayleighDamping({ alphaM: .1, betaK: .002, period1: -1 })).toMatchObject({ alphaM: .1, betaK: .002, error: undefined })
  })
  it('accepts modal names without needing known periods', () => {
    expect(rayleighDamping({ dampingMode: 'Modal periods', modalPeriod1: 'T1', modalPeriod2: 't3', dampingPercent: 5 })).toMatchObject({
      alphaM: 0, betaK: 0, modalAnchors: { mode1: 1, mode2: 3, ratio: .05 }, error: undefined,
    })
  })
  it.each(['T0', 'T-1', '1', 'T1.5', '', 'T99999999999999999'])('rejects invalid modal name %s', (modalPeriod1) => {
    expect(rayleighDamping({ dampingMode: 'Modal periods', modalPeriod1 }).error).toBeTruthy()
  })
  it('accepts zero damping', () => {
    expect(rayleighDamping({ dampingMode: 'Anchor periods', period1: 1, period2: .2, dampingPercent: 0 })).toMatchObject({ alphaM: 0, betaK: 0, error: undefined })
  })
  it.each([{ period1: 0, period2: 1 }, { period1: '', period2: 1 }, { period1: 1 }, { period1: 1, period2: NaN },
    { period1: 1, period2: .2, dampingPercent: -1 }, { period1: 1, period2: .2, dampingPercent: 101 },
    { period1: 1, period2: .2, dampingPercent: '' }, { period1: 1e308, period2: 1e308 }])('rejects invalid inputs %j', (params) => {
    const d = rayleighDamping({ ...params, dampingMode: 'Anchor periods' })
    expect(d.error).toBeTruthy(); expect(d.alphaM).toBeNaN(); expect(d.betaK).toBeNaN()
  })
})
