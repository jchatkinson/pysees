/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { parseGroundMotion } from '@/app/lib/groundMotion'
import { describe, expect, it } from 'vitest'
import { modelFromWrites } from './testkit'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { exportScript } from '@/app/lib/exportScript'
import { runCarapace } from './carapaceRunner'
import { compareRuns } from './comparison'
import { opensesAvailable, runOpenSees } from './opensesRunner'
import { importScript } from '@/app/lib/scriptImport'
import type { AnalysisHistory } from '@/app/types/analysisCommands'

function fixture(ndm: 2 | 3, factor = 1) {
  const ndf = ndm === 2 ? 3 : 6
  const model = modelFromWrites(ndm, ndf, [
    { kind: 'node', entity: { id: 1, coords: ndm === 2 ? [0, 0] : [0, 0, 0] } },
    { kind: 'node', entity: { id: 2, coords: ndm === 2 ? [0, 3] : [0, 0, 3] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: Array.from({ length: ndf }, (_, i) => i + 1) } },
    { kind: 'mass', entity: { nodeId: 2, values: ndm === 2 ? [2, 2, 0] : [2, 2, 2, 0, 0, 0] } },
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1, ...(ndm === 3 ? { vecxz: [1, 0, 0] } : {}) } } },
    { kind: 'element', entity: { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { A: 1, E: 1000, Iz: 1, G: 400, J: 1, Iy: 2, transfTag: 1, mass: 0.5 } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Path', args: { type: 'Path', tag: 1, dt: .01, values: [0, 1, -1, .5, 0], factor } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'UniformExcitation', args: { type: 'UniformExcitation', patternTag: 1, dir: 1, accelSeriesTag: 1, fact: 1 }, children: [] } },
  ])
  const history: AnalysisHistory = { cursor: 1, commands: [
    { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { dynamic: 'Yes' } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-earthquake-analysis', params: { dt: .01, nSteps: 20, alphaM: .1, betaK: .001, algorithm: 'Linear' } },
  ] }
  return { model, history }
}

describe('transient pipeline', () => {
  it.each([2, 3] as const)('compiles and runs %iD ground motion with bounded acceleration and distributed mass', (ndm) => {
    const { model, history } = fixture(ndm)
    const run = runCarapace(model, history)
    expect(run.error).toBeNull(); expect(run.times).toHaveLength(20)
    expect(run.times.at(-1)).toBeCloseTo(.2)
    const stage = run.compile.input!.sequence.stages[0]
    expect(stage.kind).toBe('transient')
    if (stage.kind !== 'transient') throw new Error('Wrong stage')
    expect(stage.groundMotions[0]).toMatchObject({ direction: 0, scaleFactor: 1, series: { kind: 'boundedPath', useLast: false } })
    expect(run.columns.flat().some((v) => Math.abs(v) > 1e-6)).toBe(true)
  })
  it.skipIf(!opensesAvailable)('uses the same anchor-period coefficients in Carapace and OpenSees export', () => {
    const { model, history } = fixture(2)
    const command = history.commands[1]
    if (command.type !== 'ANALYSIS_BLOCK') throw new Error('Wrong command')
    Object.assign(command.params, { dampingMode: 'Anchor periods', period1: 1, period2: .2, dampingPercent: 5 })
    const run = runCarapace(model, history), text = exportScript(model, history), reference = runOpenSees(text)
    expect(run.error).toBeNull(); expect(reference.failures, reference.stderr).toEqual([])
    const stage = run.compile.input!.sequence.stages[0]
    if (stage.kind !== 'transient') throw new Error('Wrong stage')
    expect(stage.damping.alphaM).toBeCloseTo(Math.PI / 6)
    expect(stage.damping.betaK).toBeCloseTo(.05 / (6 * Math.PI))
    expect(text).toContain(`ops.rayleigh(${stage.damping.alphaM}, ${stage.damping.betaK}, 0, 0)`)
    const comparison = compareRuns(model, run, reference.files)
    for (const q of ['disp', 'vel', 'accel', 'reaction', 'force'] as const) expect(comparison.maxRel[q], q).toBeLessThan(1e-5)
    command.params.period1 = -1
    expect(compileInputV1(model, history).input).toBeNull()
  })
  it.skipIf(!opensesAvailable).each([2, 3] as const)('resolves modal damping in %iD without a separate modal block', (ndm) => {
    const { model, history } = fixture(ndm)
    const command = history.commands[1]
    if (command.type !== 'ANALYSIS_BLOCK') throw new Error('Wrong command')
    const modalPeriod2 = ndm === 2 ? 'T2' : 'T3'
    Object.assign(command.params, { dampingMode: 'Modal periods', modalPeriod1: 'T1', modalPeriod2, dampingPercent: 5 })
    const run = runCarapace(model, history), text = exportScript(model, history), reference = runOpenSees(text)
    expect(run.error).toBeNull(); expect(reference.failures, reference.stderr).toEqual([])
    expect(text).toContain("ops.eigen('-fullGenLapack'")
    expect(text).not.toContain('ops.rayleighFromModes')
    expect(exportScript(model, history, 'tcl')).toContain('[eigen -fullGenLapack')
    const comparison = compareRuns(model, run, reference.files)
    for (const q of ['disp', 'vel', 'accel', 'reaction', 'force'] as const) expect(comparison.maxRel[q], q).toBeLessThan(1e-5)
    command.params.modalPeriod2 = 'T99'
    expect(runCarapace(model, history).error).toBeTruthy()
    command.params.modalPeriod2 = 'T0'
    expect(compileInputV1(model, history).input).toBeNull()
  })
  it('retains zero scale factors and refuses unsupported or invalid earthquake inputs', () => {
    const { model, history } = fixture(2, 0)
    expect(runCarapace(model, history).columns.flat().every((v) => v === 0)).toBe(true)
    model.patterns.get(1)!.args.dir = 3
    expect(compileInputV1(model, history).input).toBeNull()
    model.patterns.get(1)!.args.dir = 1
    model.timeSeries.get(1)!.args.filePath = 'local.txt'
    expect(compileInputV1(model, history).input).toBeNull()
  })
  it.each(['py', 'tcl'] as const)('exports embedded samples and beam mass in %s', (lang) => {
    const { model, history } = fixture(2)
    const text = exportScript(model, history, lang)
    expect(text).toContain('-values')
    const imported = importScript(text, `model.${lang}`)
    expect(imported.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(imported.model?.timeSeries.get(1)?.args.values).toEqual([0, 1, -1, .5, 0])
    expect(imported.model.masses.get(2)?.values[0]).toBe(2.75)
    expect(imported.model.elements.get(1)?.args.mass).toBeUndefined()
  })
  it.skipIf(!opensesAvailable).each([2, 3] as const)('matches real OpenSees for %iD after the accelerogram ends', (ndm) => {
    const { model, history } = fixture(ndm)
    const run = runCarapace(model, history), reference = runOpenSees(exportScript(model, history))
    expect(reference.failures, reference.stderr).toEqual([])
    const comparison = compareRuns(model, run, reference.files)
    expect(comparison.steps).toEqual({ carapace: 20, opensees: 20 })
    for (const q of ['disp', 'vel', 'accel', 'reaction', 'force'] as const) {
      expect(comparison.compared[q]).toBeGreaterThan(0)
      expect(comparison.maxRel[q], `${q}: ${JSON.stringify(comparison)}`).toBeLessThan(1e-5)
    }
  })
  it.skipIf(!opensesAvailable)('runs the supplied PEER record through both engines with a zero initial sample', () => {
    const { model, history } = fixture(2)
    const record = parseGroundMotion(readFileSync('public/LOS000.AT2', 'utf8'))
    model.timeSeries.get(1)!.args = { type: 'Path', tag: 1, dt: record.dt, values: record.values, factor: 9.80665, '-prependZero': true }
    const command = history.commands[1]
    if (command.type === 'ANALYSIS_BLOCK') { command.params.nSteps = 2005; command.params.algorithm = 'Newton' }
    const run = runCarapace(model, history), reference = runOpenSees(exportScript(model, history))
    expect(run.error).toBeNull(); expect(reference.failures, reference.stderr).toEqual([])
    const comparison = compareRuns(model, run, reference.files)
    expect(comparison.steps).toEqual({ carapace: 2005, opensees: 2005 })
    for (const q of ['disp', 'vel', 'accel', 'reaction', 'force'] as const) expect(comparison.maxRel[q], q).toBeLessThan(1e-5)
  })

  it.skipIf(!opensesAvailable)('retains frozen gravity before activating the selected earthquake pattern', () => {
    const { model, history } = fixture(3)
    model.timeSeries.set(2, { id: 2, tsType: 'Linear', args: { type: 'Linear', tag: 2 } })
    model.patterns.set(2, { id: 2, patternType: 'Plain', args: { type: 'Plain', patternTag: 2, tsTag: 2 }, children: [{ kind: 'load', args: { nodeTag: 2, values: [0, 0, -10, 0, 0, 0] } }] })
    history.commands.splice(1, 0, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { steps: 2, patterns: [2], algorithm: 'Linear' } })
    history.cursor = 2
    const run = runCarapace(model, history), text = exportScript(model, history), reference = runOpenSees(text)
    expect(text.indexOf("ops.pattern('UniformExcitation'")).toBeGreaterThan(text.indexOf('ops.loadConst'))
    expect(run.error).toBeNull(); expect(reference.failures, reference.stderr).toEqual([])
    const comparison = compareRuns(model, run, reference.files)
    expect(comparison.steps).toEqual({ carapace: 22, opensees: 22 })
    for (const q of ['disp', 'vel', 'accel', 'reaction', 'force'] as const) expect(comparison.maxRel[q], q).toBeLessThan(1e-5)
  })

  it('uses only the selected ground-motion patterns and diagnoses invalid analysis settings', () => {
    const { model, history } = fixture(3)
    model.patterns.set(2, { ...model.patterns.get(1)!, id: 2, args: { type: 'UniformExcitation', patternTag: 2, dir: 2, accelSeriesTag: 1 } })
    const command = history.commands[1]
    if (command.type !== 'ANALYSIS_BLOCK') throw new Error('Wrong command')
    command.params.patterns = [2]
    const compiled = compileInputV1(model, history).input!
    const stage = compiled.sequence.stages[0]
    expect(stage.kind === 'transient' && stage.groundMotions.map((g) => g.direction)).toEqual([1])
    command.params.dt = 0
    expect(compileInputV1(model, history).input).toBeNull()
    command.params.dt = .01; command.params.nSteps = 0
    expect(compileInputV1(model, history).input).toBeNull()
    command.params.nSteps = 20; command.params.betaK = -1
    expect(compileInputV1(model, history).input).toBeNull()
  })

})
