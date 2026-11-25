import { describe, expect, it } from 'vitest'
import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import { availableTargets, channelTerms, describeChannel } from './channels'

describe('stud-wall plot channels', () => {
  const empty = () => new Map<number, { offset: number; labels: string[] }>()
  const studWall = new Map([[1, { offset: 1, labels: ['shear', 'axial', 'moment', 'p1.shear'] }], [2, { offset: 5, labels: ['shear', 'axial', 'moment', 'p1.shear', 'p2.shear'] }]])
  const layout = { columns: { disp: empty(), vel: empty(), accel: empty(), reaction: empty(), force: empty(), shell: empty(), studWall } } as unknown as RunLayout

  it('lists every wall and the union of their components', () => {
    expect(availableTargets(layout).studWall).toEqual({ tags: [1, 2], components: ['shear', 'axial', 'moment', 'p1.shear', 'p2.shear'] })
  })

  it('sums walls and reports a component one wall lacks as no data', () => {
    expect(channelTerms({ type: 'response', kind: 'studWall', component: 'shear', mode: 'sum', tags: [1, 2], scale: 1 }, layout)).toEqual([{ column: 1, coef: 1 }, { column: 5, coef: 1 }])
    expect(channelTerms({ type: 'response', kind: 'studWall', component: 'p2.shear', mode: 'single', tags: [1], scale: 1 }, layout)).toBeNull()
    expect(describeChannel({ type: 'response', kind: 'studWall', component: 'shear', mode: 'single', tags: [2], scale: 1 })).toBe('shear W2')
  })
})
