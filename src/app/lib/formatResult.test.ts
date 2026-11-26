import { describe, expect, it } from 'vitest'
import { formatResult, parseNumberFormat } from '@/app/lib/formatResult'

describe('formatResult', () => {
  it('keeps the 5-figure table format by default', () => {
    expect(formatResult(1.23456789)).toBe('1.2346')
    expect(formatResult(-0.5)).toBe('-0.50000')
    expect(formatResult(12345.6)).toBe('12346')
    expect(formatResult(123456)).toBe('1.2346e+5')
    expect(formatResult(1.5e-5)).toBe('1.5000e-5')
    expect(formatResult(1e-9, 5, 1e-6)).toBe('0')
  })
  it('takes its decimals from the rounded value', () => expect(formatResult(9.99996)).toBe('10.000'))
  it('follows the requested significant figures', () => {
    expect(formatResult(1.23456789, 3)).toBe('1.23')
    expect(formatResult(1.23456789, 7)).toBe('1.234568')
    expect(formatResult(0.000123456, 2)).toBe('0.00012')
  })
  it('drops trailing zeros without padding', () => {
    expect(formatResult(1.5, 5, 0, false)).toBe('1.5')
    expect(formatResult(123456, 3, 0, false)).toBe('1.23e+5')
    expect(formatResult(12345, 3, 0, false)).toBe('12300')
  })
  it('reads non-finite values', () => {
    expect(formatResult(NaN)).toBe('—')
    expect(formatResult(-Infinity)).toBe('−∞')
  })
  it('parses saved formats, clamping and defaulting', () => {
    expect(parseNumberFormat({ digits: 4, labelDigits: 2 })).toEqual({ digits: 4, labelDigits: 2 })
    expect(parseNumberFormat({ digits: 40 })).toEqual({ digits: 8, labelDigits: 3 })
    expect(parseNumberFormat(undefined)).toEqual({ digits: 5, labelDigits: 3 })
  })
})
