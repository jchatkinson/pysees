import { describe, expect, it } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { compareRuns } from '@/app/lib/commands/comparison'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { TEMPLATE_FIXTURES } from '@/app/lib/commands/testkit'
import { CASES } from '@/app/lib/verification/cases'
import { verifyCase } from '@/app/lib/verification/verify'
import { RTOL } from '@/app/lib/verification/types'

/**
 * Every verification case (`lib/verification/cases.ts`), run twice: in Carapace (the wasm engine the app uses) and in real OpenSees from
 * the script the app exports. The recorded displacements, reactions, element forces and shell resultants (velocities and accelerations
 * on transient steps; frequencies and mode shapes for modal cases) must agree step by step. The same cases, and the same measurements,
 * are what the site's verification page shows (`VERIFY=1 npx vitest run src/app/lib/verification`).
 *
 * Tolerance is relative to the largest OpenSees value of each quantity. Observed agreement is ~1e-6; the limit leaves a few-fold margin.
 */
describe.skipIf(!opensesAvailable)('Carapace agrees with OpenSees', () => {
  it.each(CASES.map((c) => ({ ...c, name: c.id })))('$name', (c) => {
    const { result, opensees } = verifyCase(c)
    expect(result.problems, opensees.stderr).toEqual([])
    expect(result.pass).toBe(true)
  }, 60_000)

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
