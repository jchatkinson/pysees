import { describe, expect, it } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { compareRuns } from '@/app/lib/commands/comparison'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { TEMPLATE_FIXTURES } from '@/app/lib/commands/testkit'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import type { AnalysisCommand, AnalysisHistory } from '@/app/types/analysisCommands'

const template = TEMPLATE_FIXTURES.find((f) => f.name === 'frame-elastic')!
// These tests isolate static stage inheritance from the template's earthquake case.
const staticCommands = ['whole-model-recorder', 'run-eigen-analysis', 'run-gravity-analysis', 'run-pushover-analysis'].map((id) =>
  template.history.commands.find((c) => c.type === 'ANALYSIS_BLOCK' && c.blockId === id)!)
const frame = {
  model: { ...template.model, patterns: new Map([...template.model.patterns].filter(([, p]) => p.patternType !== 'UniformExcitation')) },
  history: { commands: staticCommands, cursor: staticCommands.length - 1 },
}
const block = (blockId: string, params: Record<string, unknown> = {}): AnalysisCommand => ({ type: 'ANALYSIS_BLOCK', blockId, params })
const recorder = block('whole-model-recorder', { directory: 'out' })
const gravity = block('run-gravity-analysis', { patterns: [1, 2], steps: 4, holdLoads: 'Yes' })
const history = (...commands: AnalysisCommand[]): AnalysisHistory => ({ commands, cursor: commands.length - 1 })

describe('each analysis is its own case', () => {
  it('records every static stage\'s initial state as its step 0 (the state it inherits)', () => {
    const run = runCarapace(frame.model, frame.history) // recorder, eigen, gravity (hold), pushover
    expect(run.error).toBeNull()
    const columns = run.columns.length
    const stageIndices = [...run.initial.keys()].sort()
    expect(stageIndices).toEqual([1, 2]) // the eigen stage (0) has no steps
    expect(run.initial.get(1)!.every((v) => v === 0)).toBe(true) // gravity starts undeformed, unloaded
    const gravityEnd = Array.from({ length: columns }, (_, c) => run.columns[c][9]) // gravity has 10 steps
    run.initial.get(2)!.forEach((v, c) => expect(v, `column ${c}`).toBeCloseTo(gravityEnd[c], 9)) // pushover starts where gravity ended
  })

  it('compiles a Reset Model block to a reset stage, and exports ops.reset()', () => {
    const h = history(recorder, gravity, block('reset-model'), gravity)
    expect(compileInputV1(frame.model, h).input?.sequence.stages.map((s) => s.kind)).toEqual(['static', 'reset', 'static'])
    expect(exportScript(frame.model, h, 'py')).toContain('ops.reset()')
  })

  it('treats a disabled block as removed, from Carapace and from the exported script', () => {
    const disabled: AnalysisCommand = { ...block('run-eigen-analysis', { modes: 2 }), disabled: true }
    const h = history(recorder, disabled, gravity)
    expect(compileInputV1(frame.model, h).input?.sequence.stages.map((s) => s.kind)).toEqual(['static'])
    expect(exportScript(frame.model, h, 'py')).not.toContain('ops.eigen')
    expect(exportScript(frame.model, history(recorder, { ...disabled, disabled: undefined }, gravity), 'py')).toContain('ops.eigen(2)')
  })

  it('starts a later analysis from a clean state after Reset Model, as OpenSees does', () => {
    if (!opensesAvailable) return
    const h = history(recorder, gravity, block('reset-model'), gravity)
    const carapace = runCarapace(frame.model, h)
    expect(carapace.error).toBeNull()
    // The second gravity stage starts from the as-built state (zero displacement), not the first's end.
    for (const plan of carapace.compile.recorderPlans.filter((p) => p.kind === 'disp')) {
      for (let j = 0; j < plan.componentLayout.length; j++) expect(carapace.initial.get(2)![plan.columnOffset + j]).toBe(0)
    }
    const opensees = runOpenSees(exportScript(frame.model, h, 'py'))
    expect(opensees.failures, opensees.stderr).toEqual([])
    const cmp = compareRuns(frame.model, carapace, opensees.files)
    expect(cmp.steps.opensees).toBe(cmp.steps.carapace)
    for (const q of ['disp', 'reaction', 'force'] as const) expect(cmp.maxRel[q], q).toBeLessThan(1e-5)
  })
})

describe.skipIf(!opensesAvailable)('Carapace agrees with OpenSees across wipeAnalysis', () => {
  it('and runs the same sequence with a Wipe Analysis block between analyses', () => {
    const h = history(recorder, gravity, block('wipe-analysis'), block('run-pushover-analysis', { patterns: [3], nodeTag: 9, dof: 1, increment: 0.001, steps: 5 }))
    const carapace = runCarapace(frame.model, h)
    expect(carapace.error).toBeNull()
    const opensees = runOpenSees(exportScript(frame.model, h, 'py'))
    expect(opensees.failures, opensees.stderr).toEqual([])
    const cmp = compareRuns(frame.model, carapace, opensees.files)
    expect(cmp.steps.opensees).toBe(cmp.steps.carapace)
    for (const q of ['disp', 'reaction', 'force'] as const) expect(cmp.maxRel[q], q).toBeLessThan(1e-5)
  })
})
