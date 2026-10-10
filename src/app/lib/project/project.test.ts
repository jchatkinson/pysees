import { describe, expect, it } from 'vitest'
import { emptyAnalysisHistory, type AnalysisHistory } from '@/app/types/analysisCommands'
import { ALL_FIXTURES, modelFromWrites, plain, shellPressureFixture, type Fixture } from '@/app/lib/commands/testkit'
import { exportScript } from '@/app/lib/exportScript'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'
import { captureProject, type ProjectDocument } from '@/app/lib/project/types'
import { serializeProject } from '@/app/lib/project/serialize'
import { isProjectText, parseProject } from '@/app/lib/project/parse'
import { readScriptFile } from '@/app/lib/project/open'

const docOf = (f: { model: Fixture['model']; history: AnalysisHistory }, extra: Partial<Parameters<typeof captureProject>[0]> = {}): ProjectDocument => captureProject({
  model: f.model, analysisHistory: f.history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null,
  viewSettings: { showGrid: true }, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW, ...extra,
})

/** Complete persistent state, comparable regardless of map insertion order. */
const state = (d: ProjectDocument) => ({ ...d, model: { ...plain(d.model), nextIds: d.model.nextIds } })

function roundTrip(doc: ProjectDocument) {
  const text = serializeProject(doc)
  const result = parseProject(text)
  expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
  expect(result.project).toBeDefined()
  return { text, project: result.project!, result }
}

const gravity = { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 3 } } as const
const recorder = { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } } as const
const earthquakeFixture = (): Fixture => {
  const model = modelFromWrites(2, 3, [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } }, { kind: 'node', entity: { id: 2, coords: [0, 3] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } }, { kind: 'mass', entity: { nodeId: 2, values: [2, 2, 0] } },
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } },
    { kind: 'element', entity: { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { A: 1, E: 1000, Iz: 1, transfTag: 1, mass: 0.5 } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Path', args: { type: 'Path', tag: 1, dt: 0.01, values: [0, 1, -1, 0.5, 0], factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'UniformExcitation', args: { type: 'UniformExcitation', patternTag: 1, dir: 1, accelSeriesTag: 1, fact: 1 }, children: [] } },
  ])
  const commands: AnalysisHistory['commands'] = [{ ...recorder, params: { dynamic: 'Yes' } }, { type: 'ANALYSIS_BLOCK', blockId: 'run-earthquake-analysis', params: { dt: 0.01, nSteps: 20, alphaM: 0.1, betaK: 0.001, algorithm: 'Linear' } }]
  return { name: 'earthquake', model, history: { commands, cursor: 1 } }
}

describe('save then open restores the authored project', () => {
  it.each([...ALL_FIXTURES(), shellPressureFixture(), earthquakeFixture()])('$name', (f) => {
    const doc = docOf(f)
    const { project } = roundTrip(doc)
    expect(state(project)).toEqual(state(doc))
  })

  it('keeps names, templates, counters, deleted-id gaps, disabled and grouped analyses, grids, plots and display settings', () => {
    const f = earthquakeFixture()
    f.model.nextIds.node = 40
    f.model.patterns.set(1, { ...f.model.patterns.get(1)!, name: 'Ünïcode\n"quoted" \\ name # @pysees' })
    f.model.mpConstraints.set(7, { id: 7, kind: 'equalDOF', args: { rNodeTag: 1, cNodeTag: 2, dofs: [2] } })
    f.model.mpConstraints.set(3, { id: 3, kind: 'equalDOF', args: { rNodeTag: 1, cNodeTag: 2, dofs: [1] } })
    f.model.nextIds.mpConstraint = 12
    f.model.sections.set(5, { id: 5, secType: 'Fiber', args: { type: 'Fiber', secTag: 5 }, children: [], template: { kind: 'rect', params: { b: 0.3, h: 0.5 } } as never })
    f.model.nextIds.section = 6
    f.model.nextIds.misc = 3
    f.model.misc.set(2, { id: 2, fn: 'region', args: { tag: 9 } })
    const free = { ...gravity, params: { steps: 3 } } // claims no pattern, so the ground-motion pattern is not declared twice
    const group = { type: 'SCRIPT_GROUP', source: 'line1\nline "2" ü', commands: [{ ...free, disabled: true }, { type: 'ANALYSIS_OPS', fn: 'wipeAnalysis', values: {} }] } as const
    const history: AnalysisHistory = { commands: [...f.history.commands, { ...free, disabled: true }, group as never, free], cursor: 4 }
    const doc = docOf({ model: f.model, history }, {
      gridlines: [{ id: 3, label: 'A', start: [0, 0], end: [0, 5] }], levels: [{ id: 2, label: 'L1', height: 3 }], nextGridlineId: 9, nextLevelId: 4,
      savedPlots: [{ kind: 'plot', id: 2, name: 'Drift', config: { series: [], sharedX: true, x: { type: 'step' }, showStageTicks: true, showStepMarker: false } }], nextSavedPlotId: 5, activeSavedPlotId: 2,
      hiddenLoadPatterns: [1], viewSettings: { showGrid: false },
    })
    const { project } = roundTrip(doc)
    expect(state(project)).toEqual(state(doc))
    expect(project.analysis.commands).toHaveLength(5)
  })

  it('saves analysis commands through the cursor only', () => {
    const f = earthquakeFixture()
    const { project } = roundTrip(docOf({ model: f.model, history: { commands: [recorder, gravity, { ...gravity, params: { patterns: [1], steps: 9 } }], cursor: 1 } }))
    expect(project.analysis).toEqual({ commands: [recorder, gravity], cursor: 1 })
  })

  it('is deterministic: save → open → save gives identical text', () => {
    for (const f of [...ALL_FIXTURES(), shellPressureFixture(), earthquakeFixture()]) {
      const once = serializeProject(docOf(f))
      expect(serializeProject(parseProject(once).project!)).toBe(once)
    }
  })

  it('survives CRLF line endings', () => {
    const f = shellPressureFixture()
    const text = serializeProject(docOf(f)).replace(/\n/g, '\r\n')
    expect(state(parseProject(text).project!)).toEqual(state(docOf(f)))
  })
})

describe('generated blocks', () => {
  it('restore shell pressure and DKGT self-weight exactly once, at their original positions', () => {
    const f = shellPressureFixture()
    const pattern = f.model.patterns.get(1)!
    expect(pattern.children.map((c) => c.kind)).toEqual(['load', 'load', 'eleLoad', 'eleLoad'])
    const { project, text } = roundTrip(docOf(f))
    expect(project.model.patterns.get(1)!.children).toEqual(pattern.children)
    expect(text).toContain('# @pysees generated begin')
    expect(text).toContain('shell pressure from element')
  })

  it('restore the authored beam mass and element after the earthquake conversion', () => {
    const f = earthquakeFixture()
    const { project, text } = roundTrip(docOf(f))
    expect(project.model.elements.get(1)!.args.mass).toBe(0.5)
    expect(project.model.masses.get(2)!.values).toEqual([2, 2, 0])
    expect(project.model.masses.get(1)).toBeUndefined()
    expect(text).toContain('"kind":"beamMass"')
  })

  it('ignore hand edits inside a block but keep ordinary edits outside it', () => {
    const f = shellPressureFixture()
    const text = serializeProject(docOf(f)).replace(/(ops\.load\(\d+, )/g, '$1999, ').replace("ops.node(1, ", 'ops.node(1, 5, ').replace(/ops\.fix\(4, .*\)/, 'ops.fix(4, 1, 1, 1, 1, 1, 0)')
    const edited = parseProject(text)
    expect(edited.project, JSON.stringify(edited.diagnostics)).toBeDefined()
    // Outside the block: the two user loads (ops.load lines before the block) and the fix are edited and honoured.
    expect(edited.project!.model.fixes.get(4)!.dofs).toEqual([1, 2, 3, 4, 5])
    expect(edited.project!.model.patterns.get(1)!.children.filter((c) => c.kind === 'eleLoad')).toEqual(f.model.patterns.get(1)!.children.filter((c) => c.kind === 'eleLoad'))
    expect(edited.project!.model.patterns.get(1)!.children).toHaveLength(4)
  })
})

describe('invalid projects block opening', () => {
  const good = () => serializeProject(docOf(earthquakeFixture()))
  const bad = (text: string) => { const r = parseProject(text); expect(r.project).toBeUndefined(); return r.diagnostics.filter((d) => d.severity === 'error') }

  it('reports malformed JSON with its line', () => {
    const text = good().replace('# @pysees layout {', '# @pysees layout {oops')
    const [e] = bad(text)
    expect(e.message).toMatch(/Malformed/)
    expect(e.line).toBe(text.split('\n').findIndex((l) => l.includes('@pysees layout')) + 1)
  })
  it('rejects a newer version', () => expect(bad(good().replace('"version":1', '"version":99'))[0].message).toMatch(/newer PySees/))
  it('rejects unmatched boundaries', () => {
    expect(bad(good().replace('# @pysees analysis end', ''))[0].message).toMatch(/never closed|inside/)
    expect(bad(`${good()}\n# @pysees generated end\n`)[0].message).toMatch(/no matching begin/)
  })
  it('rejects unknown directives, unknown analysis blocks and unreadable required commands', () => {
    expect(bad(good().replace('@pysees layout', '@pysees nonsense'))[0].message).toMatch(/Unknown directive/)
    expect(bad(good().replace('run-earthquake-analysis', 'run-nothing'))[0].message).toMatch(/unknown analysis block/)
    expect(bad(good().replace(/ops\.node\(2, .*\)/, "ops.node(2, 'x', 3)"))[0].message).toMatch(/node/)
  })
  it('requires the header', () => expect(bad(good().replace(/^# @pysees project.*$/m, ''))[0].message).toMatch(/header is missing/))
})

describe('opening files', () => {
  it('gives a project full restoration and an unannotated script the model-only importer', () => {
    const f = ALL_FIXTURES()[1]
    const saved = readScriptFile(serializeProject(docOf(f)), 'a.py')
    expect(saved.project).toBeDefined()
    const plainScript = readScriptFile(exportScript(f.model, f.history), 'a.py')
    expect(plainScript.project).toBeUndefined()
    expect(plainScript.writes.length).toBeGreaterThan(0)
    expect(isProjectText(exportScript(f.model, f.history))).toBe(false)
  })
  it('the plain exporter output is unchanged by annotation support', () => {
    const f = earthquakeFixture()
    expect(exportScript(f.model, f.history)).not.toContain('@pysees')
  })
})

describe.skipIf(!opensesAvailable)('saved scripts run in real OpenSeesPy', () => {
  it.each([...ALL_FIXTURES(), shellPressureFixture(), earthquakeFixture()])('$name', (f) => {
    const doc = docOf(f)
    const saved = runOpenSees(serializeProject(doc)), plainRun = runOpenSees(exportScript(f.model, f.history))
    expect(saved.failures, saved.stderr).toEqual([])
    expect(saved.ok).toBe(true)
    expect(saved.stdout).toBe(plainRun.stdout)
    expect(saved.files).toEqual(plainRun.files)
  })
  it('skips disabled commands', () => {
    const f = ALL_FIXTURES()[1]
    const history: AnalysisHistory = { commands: [recorder, { ...gravity, disabled: true }], cursor: 1 }
    const doc = docOf({ model: f.model, history })
    expect(serializeProject(doc)).not.toContain('ops.analyze')
    expect(emptyAnalysisHistory().cursor).toBe(-1)
  })
})
