import { describe, expect, it } from 'vitest'
import { CASE_PAGES, MISSING_DESCRIPTIONS, agreement, sci } from './content'

describe('verification pages', () => {
  it('describe every case', () => {
    expect(MISSING_DESCRIPTIONS).toEqual([])
    for (const c of CASE_PAGES) {
      expect(c.title, c.id).not.toBe(c.id)
      expect(c.description.length, c.id).toBeGreaterThan(20)
      expect(c.features.length, c.id).toBeGreaterThan(0)
      expect(c.body.length, c.id).toBeGreaterThan(50)
    }
  })
  it('explain every known difference', () => {
    for (const c of CASE_PAGES.filter((c) => c.knownDifference)) expect(c.rtol.why!.length, c.id).toBeGreaterThan(80)
  })
  it('write small numbers for people', () => {
    expect(sci(1.12e-6)).toBe('1.1 × 10⁻⁶')
    expect(sci(0.05)).toBe('0.05')
    expect(agreement({ ...CASE_PAGES[0], rtol: { value: 0.05, why: 'x' } })).toBe('within 5%')
  })
})
