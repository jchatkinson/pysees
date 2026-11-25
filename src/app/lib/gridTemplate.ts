import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import { alphaLabel } from '@/app/lib/gridlines'

/**
 * A list of spacings: `6, 8.5`, `3@6` (three of 6), mixed `2@20 ft, 24 ft`. `parseLength` reads one length (with an optional unit).
 * Null when any item doesn't parse or isn't positive; an empty list is `[]`.
 */
export function parseSpacings(text: string, parseLength: (t: string) => number | null): number[] | null {
  const out: number[] = []
  for (const raw of text.split(/[,;]/).map((t) => t.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*[@x×*]\s*(.+)$/.exec(raw)
    const n = m ? Number(m[1]) : 1
    const v = parseLength(m ? m[2] : raw)
    if (v === null || !(v > 0) || !(n >= 1) || n > 500) return null
    for (let i = 0; i < n; i++) out.push(v)
  }
  return out
}

export interface GridTemplateParams { ndm: 2 | 3; x: number[]; y: number[]; stories: number[] }

/**
 * Grids and levels for an empty model: X grids numbered 1, 2, ... at the cumulative `x` spacings (from 0), Y grids lettered A, B, ... (3D),
 * and one level per story height (L1, L2, ...). Plan lines run past the outermost grids by a tenth of the larger plan span.
 */
export function gridTemplate({ ndm, x, y, stories }: GridTemplateParams): { gridlines: GridlineEntity[]; levels: LevelEntity[] } {
  const at = (s: number[]) => s.reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + d], [0])
  const xs = at(x), ys = ndm === 3 ? at(y) : []
  const spanX = xs[xs.length - 1], spanY = ys.length ? ys[ys.length - 1] : 0
  const over = Math.max(spanX, spanY) / 10 || 1
  let id = 1
  const gridlines: GridlineEntity[] = ndm === 2
    ? xs.map((v, i) => ({ id: id++, label: String(i + 1), start: [v], end: [v] }))
    : [
      ...xs.map((v, i) => ({ id: id++, label: String(i + 1), start: [v, -over], end: [v, spanY + over] })),
      ...ys.map((v, i) => ({ id: id++, label: alphaLabel(i), start: [-over, v], end: [spanX + over, v] })),
    ]
  const levels = stories.map((height, i) => ({ id: i + 1, label: `L${i + 1}`, height }))
  return { gridlines, levels }
}
