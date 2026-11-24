import { describe, expect, it } from 'vitest'
import { towerTemplate } from '@/app/lib/templates'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { alongTotal, loadDirection, shellAreaLoads } from '@/app/lib/shellLoads'

describe('shell area loads', () => {
  const t = towerTemplate({ stories: 1, storyH: 3, baysX: 1, bayX: 4, baysY: 1, bayY: 4, mesh: 2 })
  const m = modelFromWrites(t.ndm, t.ndf, t.writes)
  const patterns = [...m.patterns.values()]
  it('sums self-weight (rho h g) and pressure along the normal into one downward area load', () => {
    const loads = shellAreaLoads(patterns, [], m.elements, m.nodes, m.sections)
    expect(loads.size).toBe(4)
    const q = [...loads.values()][0]
    expect(q.parts.map((p) => p.kind)).toEqual(['selfWeight', 'pressure'])
    // Both act downward, so both are positive along the total (the pressure is negative along the upward normal).
    expect(q.parts.map((p) => alongTotal(p, q))).toEqual([expect.closeTo(2400 * 0.2 * 9.81), expect.closeTo(3.5e3)])
    expect(loadDirection(q)).toBe('down')
    expect(q.total[2]).toBeCloseTo(-(2400 * 0.2 * 9.81 + 3.5e3)) // quads face up, so a negative pressure pushes down
    expect(q.magnitude).toBeCloseTo(2400 * 0.2 * 9.81 + 3.5e3)
  })
  it('leaves out hidden patterns', () => {
    expect(shellAreaLoads(patterns, [1], m.elements, m.nodes, m.sections).size).toBe(0)
  })
})
