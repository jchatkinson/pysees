import type { GridlineEntity } from '@/app/types/gridlines'

export interface EvenlySpacedGridParams {
  /**
   * Plan-axis index that steps between lines. Grids only carry plan (ground-plane)
   * coordinates — index 0 is the first plan axis (X), index 1 is the second plan
   * axis (Y, 3D models only). The vertical axis (Z in 3D, Y in 2D) is never part of a grid; it's
   * owned by Levels.
   */
  axis: number
  /** value along `axis` for the first line */
  offset: number
  /** distance along `axis` between adjacent lines */
  spacing: number
  /** number of lines to generate */
  count: number
  /** template start coordinates; `axis` index is overwritten per line */
  spanStart: number[]
  /** template end coordinates; `axis` index is overwritten per line */
  spanEnd: number[]
  labelStyle: 'numeric' | 'alpha'
  labelPrefix: string
  /** 1-based numeric start, or 0-based alpha start (0=A, 1=B, ...) */
  startIndex: number
}

/** 0->A, 1->B, ..., 25->Z, 26->AA, 27->AB, ... */
export function alphaLabel(n: number): string {
  let s = ''
  let i = n
  do {
    s = String.fromCharCode(65 + (i % 26)) + s
    i = Math.floor(i / 26) - 1
  } while (i >= 0)
  return s
}

export function evenlySpacedGridlines(params: EvenlySpacedGridParams, startId: number): GridlineEntity[] {
  const { axis, offset, spacing, count, spanStart, spanEnd, labelStyle, labelPrefix, startIndex } = params
  const lines: GridlineEntity[] = []
  for (let i = 0; i < count; i++) {
    const value = offset + i * spacing
    const start = [...spanStart]
    const end = [...spanEnd]
    start[axis] = value
    end[axis] = value
    const label = labelStyle === 'alpha' ? alphaLabel(startIndex + i) : String(startIndex + i)
    lines.push({ id: startId + i, label: `${labelPrefix}${label}`, start, end })
  }
  return lines
}

/** Dash and gap in world units, from the size of the grid (a fixed `dashScale` makes sub-pixel dashes in a mm model, which shimmer). */
export type Dash = { dashSize: number; gapSize: number }
export function gridSize(gridlines: GridlineEntity[], elevationRange: [number, number] = [0, 0]): number {
  const xs = gridlines.flatMap((g) => [g.start[0] ?? 0, g.end[0] ?? 0]), ys = gridlines.flatMap((g) => [g.start[1] ?? 0, g.end[1] ?? 0])
  return Math.max(xs.length ? Math.max(...xs) - Math.min(...xs) : 0, ys.length ? Math.max(...ys) - Math.min(...ys) : 0, elevationRange[1] - elevationRange[0]) || 1
}
export const gridDash = (size: number): Dash => ({ dashSize: size / 150, gapSize: size / 300 })
