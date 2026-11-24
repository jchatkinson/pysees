import { describe, expect, it } from 'vitest'
import { towerSize, towerTemplate, TOWER_DEFAULTS } from '@/app/lib/templates'
import { modelFromWrites } from '@/app/lib/commands/testkit'

describe('tower template', () => {
  it.each([TOWER_DEFAULTS, { ...TOWER_DEFAULTS, stories: 2, baysX: 3, baysY: 1, mesh: 3 }])('reports its own size (%o)', (p) => {
    const t = towerTemplate(p), m = modelFromWrites(t.ndm, t.ndf, t.writes)
    const size = towerSize(p)
    expect([m.nodes.size, m.elements.size]).toEqual([size.nodes, size.elements])
    expect(size.dofs).toBe(6 * (m.nodes.size - m.fixes.size))
    expect(t.levels).toHaveLength(p.stories + 1)
  })
})
