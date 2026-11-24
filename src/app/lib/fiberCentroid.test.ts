import { describe, expect, it } from 'vitest'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { compareRuns } from '@/app/lib/commands/comparison'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { exportScript } from '@/app/lib/exportScript'
import type { ModelWrite } from '@/app/lib/modelWrite'

/**
 * OpenSees measures a fiber section's fiber coordinates from the area-weighted centroid of all its fibers, not from the origin they
 * were written against, so a load on the element axis bends a section that is not symmetric about that centroid less than one
 * measured from y = 0. The compiler moves the origin to the centroid so Carapace agrees.
 */
const mat = (id: number, matType: string, args: Record<string, unknown>): ModelWrite => ({ kind: 'material', entity: { id, kind: 'uniaxial', matType, args: { matTag: id, matType, ...args } } })

/** A 6 m column, 3 m x 0.2 m, with a heavy bar at y = -1.3 and a light one at y = +1.3, loaded in axial compression at the top. */
function column(): ReturnType<typeof modelFromWrites> {
  return modelFromWrites(2, 3, [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } }, { kind: 'node', entity: { id: 2, coords: [0, 3] } }, { kind: 'node', entity: { id: 3, coords: [0, 6] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } },
    mat(1, 'Elastic', { e: 3.2e10 }), mat(2, 'Elastic', { e: 2e11 }),
    { kind: 'section', entity: { id: 1, secType: 'Fiber', args: { secTag: 1, type: 'Fiber' }, children: [
      { kind: 'patch', subType: 'rect', args: { matTag: 1, numSubdivY: 20, numSubdivZ: 1, y1: -1.5, z1: -0.1, y2: 1.5, z2: 0.1 } },
      { kind: 'fiber', subType: 'fiber', args: { yloc: -1.3, zloc: 0, A: 1.3e-3, matTag: 2 } },
      { kind: 'fiber', subType: 'fiber', args: { yloc: 1.3, zloc: 0, A: 2.6e-4, matTag: 2 } },
    ] } },
    { kind: 'beamIntegration', entity: { id: 1, intType: 'Legendre', args: { type: 'Legendre', tag: 1, secTag: 1, n: 4 } } },
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } },
    { kind: 'element', entity: { id: 1, eleType: 'DispBeamColumn', nodes: [1, 2], args: { transfTag: 1, integrationTag: 1 } } },
    { kind: 'element', entity: { id: 2, eleType: 'DispBeamColumn', nodes: [2, 3], args: { transfTag: 1, integrationTag: 1 } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [0, -3e6, 0] } } },
  ])
}
const history = { commands: [{ type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } }, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 3 } }], cursor: 1 } as const

describe('fiber coordinates are measured from the fibers\' area centroid', () => {
  it('compiles each section with its fibers\' area-weighted centroid at y = 0', () => {
    const fibers = compileInputV1(column(), history as never).input!.fibers!
    const area = fibers.area, y = fibers.y
    expect(area.reduce((q, a, i) => q + a * y[i], 0) / area.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 15)
    expect(y.at(-2)).toBeCloseTo(-1.3 + 2.25e-3, 4) // the heavy bar moved by the centroid offset (-2.25 mm)
  })

  it('bends an eccentrically loaded section by the amount the stiffness centroid dictates', () => {
    // Hand calculation, with the load acting on the area centroid (-2.25 mm) while the stiffness centroid sits at -13.9 mm: 1.40e-5 rad at the top.
    const run = runCarapace(column(), history as never)
    expect(run.error).toBeNull()
    const top = run.compile.recorderPlans.find((p) => p.kind === 'disp' && p.targetTag === 3)!
    expect(Math.abs(run.columns[top.columnOffset + 2].at(-1)!)).toBeCloseTo(1.4038e-5, 8)
  })

  it.skipIf(!opensesAvailable)('agrees with OpenSees', () => {
    const model = column()
    const carapace = runCarapace(model, history as never)
    const opensees = runOpenSees(exportScript(model, history as never, 'py'))
    expect(opensees.failures, opensees.stderr).toEqual([])
    const cmp = compareRuns(model, carapace, opensees.files)
    expect(cmp.maxRel.disp).toBeLessThan(1e-5)
    expect(cmp.maxRel.force).toBeLessThan(1e-5)
  })
})
