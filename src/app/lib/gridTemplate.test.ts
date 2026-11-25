import { describe, expect, it } from 'vitest'
import { gridTemplate, parseSpacings } from './gridTemplate'

const num = (t: string) => { const n = Number(t); return t.trim() !== '' && Number.isFinite(n) ? n : null }

describe('grid template', () => {
  it('parses spacing lists', () => {
    expect(parseSpacings('3@6, 8.5', num)).toEqual([6, 6, 6, 8.5])
    expect(parseSpacings(' 2 x 4 ; 5 ', num)).toEqual([4, 4, 5])
    expect(parseSpacings('', num)).toEqual([])
    expect(parseSpacings('6, -2', num)).toBeNull()
    expect(parseSpacings('6, abc', num)).toBeNull()
  })
  it('builds numbered X grids, lettered Y grids and stories', () => {
    const { gridlines, levels } = gridTemplate({ ndm: 3, x: [6, 6], y: [5], stories: [4, 3] })
    expect(gridlines.map((g) => g.label)).toEqual(['1', '2', '3', 'A', 'B'])
    expect(gridlines[2]).toEqual({ id: 3, label: '3', start: [12, -1.2], end: [12, 6.2] })
    expect(gridlines[4]).toEqual({ id: 5, label: 'B', start: [-1.2, 5], end: [13.2, 5] })
    expect(levels).toEqual([{ id: 1, label: 'L1', height: 4 }, { id: 2, label: 'L2', height: 3 }])
  })
  it('2D grids are X positions only', () => {
    expect(gridTemplate({ ndm: 2, x: [5], y: [9], stories: [] }).gridlines).toEqual([{ id: 1, label: '1', start: [0], end: [0] }, { id: 2, label: '2', start: [5], end: [5] }])
  })
})
