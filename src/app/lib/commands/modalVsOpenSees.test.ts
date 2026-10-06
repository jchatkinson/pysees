import { describe, expect, it } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { runCarapaceModal } from '@/app/lib/commands/carapaceRunner'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { modelFromWrites, TEMPLATE_FIXTURES } from '@/app/lib/commands/testkit'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { frameTemplate } from '@/app/lib/templates'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { Model } from '@/app/types/model'

const MODES = 4
const eigenBlock = { type: 'ANALYSIS_BLOCK', blockId: 'run-eigen-analysis', params: { modes: MODES } } as const

/** The frame template with translational mass at every free node (no rotational mass — OpenSees and Carapace both condense those DOFs). */
function massedFrame(): { model: Model; history: AnalysisHistory } {
  const t = frameTemplate({ stories: 3, storyH: 3.5, bays: 2, bayW: 6, eleType: 'elasticBeamColumn', base: 'fixed' })
  let model = modelFromWrites(t.ndm, t.ndf, t.writes)
  for (const node of model.nodes.values()) if (node.coords[1] > 0) model = applyModelWrite(model, { kind: 'mass', entity: { nodeId: node.id, values: [100, 100, 0] } })
  return { model, history: { commands: [eigenBlock], cursor: 0 } }
}

describe('eigen analysis compiles', () => {
  it('to a modal stage', () => {
    const { model, history } = massedFrame()
    const { input, diagnostics } = compileInputV1(model, history)
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(input?.sequence.stages).toEqual([{ kind: 'modal', id: 'eigen', modes: MODES }])
  })

  it('and reports a model without mass instead of failing in the engine', () => {
    const { model: massed, history } = { ...TEMPLATE_FIXTURES[3], history: { commands: [eigenBlock], cursor: 0 } as AnalysisHistory }
    const model = { ...massed, masses: new Map() }
    const { diagnostics } = compileInputV1(model, history)
    expect(diagnostics.some((d) => d.severity === 'error' && /mass/i.test(d.message))).toBe(true)
  })

  it('and exports ops.eigen', () => {
    const { model, history } = massedFrame()
    expect(exportScript(model, history, 'py')).toContain(`ops.eigen(${MODES})`)
  })
})

describe('Carapace modal results', () => {
  it('give ascending frequencies, full-node shapes, and participation that sums towards the total mass', () => {
    const { model, history } = massedFrame()
    const run = runCarapaceModal(model, history)
    expect(run.error).toBeNull()
    expect(run.stages).toHaveLength(1)
    const stage = run.stages[0]
    expect(stage.modes).toHaveLength(MODES)
    const w = stage.modes.map((m) => m.frequency)
    expect([...w].sort((a, b) => a - b)).toEqual(w)
    expect(stage.modes[0].shape).toHaveLength(run.compile.nodeTags.length * stage.ndf)
    const ux = stage.modes.reduce((sum, m) => sum + m.massRatio[0], 0)
    expect(ux).toBeGreaterThan(0.5)
    expect(ux).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe.skipIf(!opensesAvailable)('Carapace modal analysis agrees with OpenSees', () => {
  it('on natural frequencies of a frame with massless rotations', () => {
    const { model, history } = massedFrame()
    const carapace = runCarapaceModal(model, history)
    expect(carapace.error).toBeNull()

    const opensees = runOpenSees(exportScript(model, history, 'py').replace(`ops.eigen(${MODES})`, `print('@@EIG', *ops.eigen(${MODES}))`)) // OpenSees drops its eigen solver after one call
    expect(opensees.failures, opensees.stderr).toEqual([])
    const line = opensees.stdout.split('\n').find((l) => l.startsWith('@@EIG'))
    const expected = line!.split(/\s+/).slice(1).map((l) => Math.sqrt(Number(l)))
    expect(expected).toHaveLength(MODES)
    carapace.stages[0].modes.forEach((m, i) => expect(Math.abs(m.frequency - expected[i]) / expected[i], `mode ${i + 1}`).toBeLessThan(1e-6))
  })
})
