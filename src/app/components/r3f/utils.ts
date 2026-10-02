export function toVec3(coords: number[]): [number, number, number] {
  return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0]
}

/** One colour per pattern (by position in the sorted pattern list), shared with the View menu swatches. */
export const PATTERN_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
export const patternColor = (patternIds: number[], id: number) => PATTERN_COLORS[Math.max(0, patternIds.indexOf(id)) % PATTERN_COLORS.length]
