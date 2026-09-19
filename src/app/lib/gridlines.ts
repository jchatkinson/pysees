import type { GridlineEntity } from '@/app/types/gridlines'

export interface EvenlySpacedGridParams {
  /**
   * Plan-axis index that steps between lines. Grids only carry plan (ground-plane)
   * coordinates — index 0 is the first plan axis (X), index 1 is the second plan
   * axis (Z, 3D models only). The vertical axis (Y) is never part of a grid; it's
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
