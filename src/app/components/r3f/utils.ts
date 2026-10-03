export function toVec3(coords: number[]): [number, number, number] {
  return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0]
}

/** One colour per pattern (by position in the sorted pattern list), shared with the View menu swatches. */
export const PATTERN_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
export const patternColor = (patternIds: number[], id: number) => PATTERN_COLORS[Math.max(0, patternIds.indexOf(id)) % PATTERN_COLORS.length]

/** Compact load magnitude for scene labels: 1.2k, 7.18, 3.4M, ... (3 significant figures). */
export function formatLoadValue(v: number): string {
  const abs = Math.abs(v)
  if (abs === 0) return '0'
  if (abs >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`
  if (abs >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`
  if (abs >= 1e-2) return `${+v.toPrecision(3)}`
  return v.toExponential(1)
}
