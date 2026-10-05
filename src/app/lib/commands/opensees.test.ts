import { describe, expect, it } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { ALL_FIXTURES } from '@/app/lib/commands/testkit'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'

/**
 * Runs exported OpenSeesPy scripts in real OpenSees: the only check that what we print is what OpenSees accepts. There is no Tcl equivalent:
 * this OpenSeesPy build has no Tcl interpreter (no `ops.source`), so exported Tcl is covered by the cross-language round trip and the golden files.
 */
describe.skipIf(!opensesAvailable)('exported OpenSeesPy runs in real OpenSees', () => {
  it.each(ALL_FIXTURES())('$name builds every node and element', ({ model, history }) => {
    const r = runOpenSees(exportScript(model, history, 'py'))
    expect(r.failures, r.stderr).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.stdout).toContain(`@@ ${model.nodes.size} ${model.elements.size}`)
  })

  it('rejects a script OpenSees rejects (the check can fail)', () => {
    const r = runOpenSees("import openseespy.opensees as ops\nops.model('basic', '-ndm', 2, '-ndf', 3)\nops.node(1, 0, 0)\nops.node(2, 1, 0)\nops.geomTransf('Linear', 1)\nops.element('ElasticBeamColumn', 1, 1, 2, 1, 1, 1, 1)")
    expect(r.ok).toBe(false)
  })
})
