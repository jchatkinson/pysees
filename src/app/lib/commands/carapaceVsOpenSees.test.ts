import { describe, expect, it } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { compareRuns } from '@/app/lib/commands/comparison'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { TEMPLATE_FIXTURES, cantilever3dFixtures, trussFixtures } from '@/app/lib/commands/testkit'

/**
 * The same model, run twice: in Carapace (the wasm engine the app uses) and in real OpenSees from the script the app exports. The
 * recorded displacements, support reactions and element forces must agree step by step. This is what makes "export the model and run it
 * in OpenSees" a faithful claim, and it checks Carapace's numerics against the reference implementation.
 *
 * Tolerance is relative to the largest OpenSees value of each quantity. Observed agreement is ~1e-6; the limit leaves a few-fold margin.
 */
const RTOL = 1e-5
const fixtures = [...TEMPLATE_FIXTURES, ...trussFixtures(), ...cantilever3dFixtures()]

describe.skipIf(!opensesAvailable)('Carapace agrees with OpenSees', () => {
  it.each(fixtures)('$name', ({ model, history }) => {
    const carapace = runCarapace(model, history)
    expect(carapace.error).toBeNull()
    expect(carapace.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])

    const opensees = runOpenSees(exportScript(model, history, 'py'))
    expect(opensees.failures, opensees.stderr).toEqual([])

    const cmp = compareRuns(model, carapace, opensees.files)
    expect(cmp.steps.opensees).toBe(cmp.steps.carapace) // OpenSees completed every step, not just the first few
    for (const q of ['disp', 'reaction', 'force'] as const) {
      expect(cmp.compared[q], `${q}: nothing was compared`).toBeGreaterThan(0)
      expect(cmp.maxRel[q], `${q}: max |diff| ${cmp.maxAbs[q]} against scale ${cmp.scale[q]}`).toBeLessThan(RTOL)
    }
  })

  it('notices when the two engines disagree (the comparison can fail)', () => {
    const { model, history } = TEMPLATE_FIXTURES[1]
    const carapace = runCarapace(model, history)
    const opensees = runOpenSees(exportScript(model, history, 'py'))
    // A 1% error in the displacement column that moves the most (not a fixed node's, which is always zero).
    const col = carapace.compile.recorderPlans.filter((p) => p.kind === 'disp').flatMap((p) => p.componentLayout.map((_l, j) => p.columnOffset + j))
      .reduce((best, c) => (Math.max(...carapace.columns[c].map(Math.abs)) > Math.max(...carapace.columns[best].map(Math.abs)) ? c : best))
    carapace.columns[col] = carapace.columns[col].map((v) => v * 1.01)
    expect(compareRuns(model, carapace, opensees.files).maxRel.disp).toBeGreaterThan(RTOL)
  })
})
