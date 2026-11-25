import { describe, expect, it } from 'vitest'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { compareRuns } from '@/app/lib/commands/comparison'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { exportScript } from '@/app/lib/exportScript'
import { importScript } from '@/app/lib/scriptImport'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { getSchemaForFn, validateSchemaResult } from '@/app/lib/commandSchemas'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'
import { captureProject } from '@/app/lib/project/types'
import { serializeProject } from '@/app/lib/project/serialize'
import { parseProject } from '@/app/lib/project/parse'

const material = (id: number, matType: string, args: Record<string, unknown>): ModelWrite => ({ kind: 'material', entity: { id, kind: 'uniaxial', matType, args: { matTag: id, matType, ...args }, usage: 'force-deformation' } })
const recorder = { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } } as const
const push = (patterns: number[], steps: number): AnalysisHistory => ({ commands: [recorder, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns, steps } }], cursor: 1 })

/** A cantilever column standing on a zero-length foundation spring pair: node 1 is fixed, node 2 sits on it, the column runs 2 -> 3. */
function column(zero: Record<string, unknown>, extra: ModelWrite[] = []) {
  const writes: ModelWrite[] = [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } }, { kind: 'node', entity: { id: 2, coords: [0, 0] } }, { kind: 'node', entity: { id: 3, coords: [0, 3] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } },
    material(1, 'Elastic', { e: 2e7 }), material(2, 'Elastic', { e: 5e6 }), material(3, 'ENT', { e: 1e8 }), ...extra,
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } },
    { kind: 'element', entity: { id: 1, eleType: 'zeroLength', nodes: [1, 2], args: zero } },
    { kind: 'element', entity: { id: 2, eleType: 'ElasticBeamColumn', nodes: [2, 3], args: { A: 0.5, E: 3e10, Iz: 0.04, transfTag: 1 } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [4e3, -2e4, 0] } } },
  ]
  return modelFromWrites(2, 3, writes)
}

describe('zeroLength elements', () => {
  // Axial, shear and rotation springs, so the column is fully supported.
  const springs = { mat: [1, 2, 1], dir: [1, 2, 3] }

  it('round-trips through an exported script, with -orient', () => {
    const model = column({ ...springs, orient: [0, 1, 0] })
    const script = exportScript(model, push([1], 2), 'py')
    expect(script).toMatch(/element\('zeroLength', 1, 1, 2, '-mat', 1, 2, 1, '-dir', 1, 2, 3, '-orient', 0, 1, 0\)/)
    const back = importScript(script, 'm.py')
    expect(back.model.elements.get(1)).toMatchObject({ eleType: 'zeroLength', nodes: [1, 2], args: { mat: [1, 2, 1], dir: [1, 2, 3], orient: [0, 1, 0] } })
  })

  it('compiles per-direction materials, orient and element force to the wire', () => {
    const model = column({ ...springs, orient: [1, 0, 0] })
    const c = compileInputV1(model, push([1], 2))
    expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(c.input!.zeroLengths).toMatchObject({ nodeI: [0], nodeJ: [1], materials: [[0, 0, 0], [0, 1, 1], [0, 2, 0]], orient: [{ row: 0, x: [1, 0, 0] }] })
  })

  it('refuses mismatched -mat and -dir, repeated directions and a bad direction', () => {
    const errors = (zero: Record<string, unknown>) => compileInputV1(column(zero), push([1], 1)).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join('; ')
    expect(errors({ mat: [1, 2], dir: [1] })).toMatch(/must pair up/)
    expect(errors({ mat: [1, 2], dir: [2, 2] })).toMatch(/direction 2 has more than one material/)
    expect(errors({ mat: [1], dir: [4] })).toMatch(/direction 4 is not between 1 and 3 in a 2D model/)
  })

  describe.skipIf(!opensesAvailable)('against OpenSees', () => {
    it('two springs in series with a column', () => {
      const model = column({ ...springs })
      const history = push([1], 4)
      const carapace = runCarapace(model, history)
      expect(carapace.error).toBeNull()
      const opensees = runOpenSees(exportScript(model, history, 'py'))
      expect(opensees.failures, opensees.stderr).toEqual([])
      const cmp = compareRuns(model, carapace, opensees.files)
      for (const q of ['disp', 'reaction', 'force'] as const) {
        expect(cmp.compared[q], `${q}: nothing was compared`).toBeGreaterThan(0)
        expect(cmp.maxRel[q], `${q}`).toBeLessThan(1e-5)
      }
    })

    it('a compression-only (ENT) bearing opens under tension and closes under compression', () => {
      const model = column({ mat: [3, 2, 1], dir: [2, 1, 3] })
      const history = push([1], 4)
      const carapace = runCarapace(model, history)
      expect(carapace.error).toBeNull()
      const cmp = compareRuns(model, carapace, runOpenSees(exportScript(model, history, 'py')).files)
      expect(cmp.maxRel.disp).toBeLessThan(1e-5)
    })
  })
})

describe('zeroLength friction (Carapace only)', () => {
  /** The bearing spring carries the normal force; shear slides once it exceeds mu * N. */
  const slide = (shear: number, normal: number) => {
    const friction = { normalDir: 2, shearDir: 1, mu: 0.4, k0: 1e8, b: 0.001 }
    const model = column({ mat: [3, 1], dir: [2, 3], friction })
    const pattern = model.patterns.get(1)!
    model.patterns.set(1, { ...pattern, children: [{ kind: 'load', args: { nodeTag: 3, values: [shear, normal, 0] } }] })
    const run = runCarapace(model, push([1], 10))
    expect(run.error).toBeNull()
    expect(run.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const ux = run.compile.recorderPlans.find((p) => p.kind === 'disp' && p.targetTag === 3)!.columnOffset
    return run.columns[ux].at(-1)!
  }

  it('sticks below mu N and slides far past it above mu N', () => {
    const sticking = slide(3e3, -1e4) // 3 kN of shear against 0.4 * 10 kN = 4 kN of friction
    const sliding = slide(6e3, -1e4)
    expect(Math.abs(sliding)).toBeGreaterThan(20 * Math.abs(sticking))
  })

  it('reports friction misuse as compile errors', () => {
    const diag = (friction: Record<string, unknown>, mats: { mat: number[]; dir: number[] }) =>
      compileInputV1(column({ ...mats, friction }), push([1], 1)).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join('; ')
    expect(diag({ normalDir: 2, shearDir: 1, mu: 0.4, k0: 1e8 }, { mat: [3, 2], dir: [2, 1] })).toMatch(/cannot also have a material/)
    expect(diag({ normalDir: 2, shearDir: 1, mu: 0.4, k0: 1e8 }, { mat: [2], dir: [1] })).toMatch(/needs a material on its normal direction/)
    expect(diag({ normalDir: 2, shearDir: 2, mu: 0.4, k0: 1e8 }, { mat: [3], dir: [2] })).toMatch(/distinct normalDir and shearDir/)
  })
})

describe('zeroLength friction in scripts and projects', () => {
  const friction = { normalDir: 2, shearDir: 1, mu: 0.4, k0: 1e8, b: 0.001 }
  const model = () => column({ mat: [3, 1], dir: [2, 3], friction })

  it('warns that a plain script cannot carry it', () => {
    const script = exportScript(model(), push([1], 1), 'py')
    expect(script).toContain('# WARNING: this element has Coulomb friction')
    expect(script).toMatch(/element\('zeroLength', 1, 1, 2, '-mat', 3, 1, '-dir', 2, 3\)/)
  })

  it('keeps it across saving and opening a project', () => {
    const m = model(), history = push([1], 1)
    const doc = captureProject({
      model: m, analysisHistory: history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null,
      viewSettings: { showGrid: true }, unitPrefs: {}, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW,
    })
    const result = parseProject(serializeProject(doc))
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    expect(result.project!.model.elements.get(1)!.args.friction).toEqual(friction)
  })
})

describe('the zeroLength form', () => {
  const model = () => column({ mat: [3, 1], dir: [2, 3] })
  const create = (values: Record<string, unknown>, existing?: number) => {
    const m = model()
    const schema = getSchemaForFn('element', 2)!
    const result = schema.create({ eleType: 'zeroLength', nodes: [1, 2], ...values }, m, existing)
    if (result.target !== 'model') throw new Error('expected a model write')
    return { write: result.write, error: validateSchemaResult(result, m, { ndm: 2, ndf: 3 }) }
  }

  it('keeps -mat, -dir, -orient and friction when an element is saved', () => {
    const friction = { normalDir: 2, shearDir: 1, mu: 0.4, k0: 1e8, b: 0.001 }
    const { write, error } = create({ mat: [3, 1], dir: [2, 3], '-orient': true, orient: [0, 1, 0], friction }, 1)
    expect(error).toBeNull()
    expect(write).toMatchObject({ kind: 'element', entity: { id: 1, eleType: 'zeroLength', args: { mat: [3, 1], dir: [2, 3], orient: [0, 1, 0], friction } } })
  })

  it('rejects unpaired, unknown, repeated and out-of-range entries', () => {
    expect(create({ mat: [], dir: [] }).error).toMatch(/at least one material/)
    expect(create({ mat: [1, 2], dir: [1] }).error).toMatch(/must pair up/)
    expect(create({ mat: [9], dir: [1] }).error).toMatch(/Material 9 does not exist/)
    expect(create({ mat: [1], dir: [4] }).error).toMatch(/Direction 4 is not between 1 and 3/)
    expect(create({ mat: [1, 2], dir: [2, 2] }).error).toMatch(/only one material/)
  })
})
