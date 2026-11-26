/** Significant figures for displayed results: `digits` in tables, readouts and panels; `labelDigits` in the viewport's value labels. Presentation only. */
export interface NumberFormat { digits: number; labelDigits: number }
export const DEFAULT_NUMBER_FORMAT: NumberFormat = { digits: 5, labelDigits: 3 }
export const DIGIT_CHOICES = [2, 3, 4, 5, 6, 7, 8] as const

const clampDigits = (d: unknown, fallback: number) => (typeof d === 'number' && Number.isInteger(d) ? Math.min(8, Math.max(2, d)) : fallback)

/** A saved number format, falling back to the defaults for anything missing or out of range. */
export function parseNumberFormat(v: unknown): NumberFormat {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { digits: clampDigits(r.digits, DEFAULT_NUMBER_FORMAT.digits), labelDigits: clampDigits(r.labelDigits, DEFAULT_NUMBER_FORMAT.labelDigits) }
}

/**
 * A result number at `digits` significant figures: `0` below `zeroTolerance`, positional for magnitudes in [1e-4, 10^max(digits, 5)),
 * scientific outside it. `pad` keeps trailing zeros (`1.2000`) so table columns line up; without it the shortest text is used.
 */
export function formatResult(value: number, digits: number = DEFAULT_NUMBER_FORMAT.digits, zeroTolerance = 0, pad = true): string {
  if (Number.isNaN(value)) return '—'
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞'
  const magnitude = Math.abs(value)
  if (magnitude === 0 || magnitude < zeroTolerance) return '0'
  const rounded = Number(value.toPrecision(digits))
  const r = Math.abs(rounded)
  if (r >= 1e-4 && r < 10 ** Math.max(digits, 5)) {
    if (!pad) return String(rounded)
    // Decimals from the rounded value, so 9.99996 at 5 figures reads 10.000, not 10.0000.
    return rounded.toFixed(Math.min(20, Math.max(0, digits - 1 - Math.floor(Math.log10(r)))))
  }
  return pad ? value.toExponential(digits - 1) : rounded.toExponential()
}
