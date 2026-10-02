/** Display format for result-table numbers: a plain `0` below `zeroTolerance`, fixed decimals with
 * 5 significant digits for magnitudes in [1e-4, 1e5), scientific notation outside that range. */
export function formatResult(value: number, zeroTolerance: number): string {
  const magnitude = Math.abs(value)
  if (magnitude < zeroTolerance) return '0'
  if (magnitude >= 1e-4 && magnitude < 1e5) {
    // toPrecision can still choose exponent form near the edges (e.g. 9.99996e4 rounds up), so go through Number.
    const digits = Math.max(0, 4 - Math.floor(Math.log10(magnitude)))
    return Number(value.toPrecision(5)).toFixed(Math.min(digits, 8))
  }
  return value.toExponential(4)
}
