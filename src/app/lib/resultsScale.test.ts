import { describe, expect, it } from 'vitest'
import { autoScale, type ModelMetrics } from './resultsScale'
import type { RunExtents } from '@/app/types/resultsStorage'

describe('member view scale', () => {
  // The largest member force spans 45% of the stud spacing, whatever the model size.
  it('sizes member bars by the stud spacing', () => {
    const metrics: ModelMetrics = { ndm: 3, diagonal: 20000, trussOnly: false, memberSpacing: 400 }
    const extents = { disp: {}, vel: {}, accel: {}, reaction: {}, force: {}, shell: {}, studWall: { 'm1.bottom': -5000, 'm2.top': 8000, 'p1.chordLeft': 30000 } } as RunExtents
    expect(autoScale('axial', extents, metrics, 'members')).toBeCloseTo((0.45 * 400) / 8000, 12)
    expect(autoScale('axial', extents, metrics, 'piers')).toBeCloseTo((0.05 * 20000) / 30000, 12)
  })
})
