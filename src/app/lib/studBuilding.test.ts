import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { runCarapace, type CarapaceRun } from '@/app/lib/commands/carapaceRunner'
import { studBuildingSpec, wallPiers } from '@/app/lib/studBuilding'
import { expansionToModel, studWallArgs } from '@/app/lib/studWalls'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { exportScript } from '@/app/lib/exportScript'
import { serializeProject } from '@/app/lib/project/serialize'
import { parseProject } from '@/app/lib/project/parse'
import { captureProject } from '@/app/lib/project/types'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { floorLoadNodal } from '@/app/lib/studWallExport'
import type { BuildingSpec } from '@/app/types/carapaceInputV1'
import type { Model, StudBuildingParams } from '@/app/types/model'

wasm.initSync({ module: readFileSync(join(process.cwd(), 'src/app/carapace/wasm/carapace_wasm_bg.wasm')) })

/** The template as the app makes it: Carapace expands the (optionally edited) spec, and the tables become ordinary entities. */
function make(params: Partial<StudBuildingParams> = {}, tweak?: (spec: BuildingSpec) => void) {
  const { spec, p } = studBuildingSpec(params)
  tweak?.(spec)
  const { input, map } = wasm.expandBuilding(spec as never, 'z')
  const t = expansionToModel(input, map, p)
  const model = modelFromWrites(3, 6, t.writes)
  return { model: { ...model, config: { ...model.config!, units: { length: 'mm', force: 'N', time: 's' } } } as Model, history: { commands: t.analysisCommands, cursor: t.analysisCommands.length - 1 }, p }
}
const wallId = (model: Model, label: string) => [...model.elements.values()].find((e) => e.eleType === 'studWall' && studWallArgs(e.args).label === label)!.id
/** A wall's recorded value at the last step (`shear`, `axial`, `moment`, or `p<n>.<quantity>`). */
const last = (run: CarapaceRun, id: number, label: string) => {
  const plan = run.compile.recorderPlans.find((p) => p.kind === 'studWall' && p.targetTag === id)!
  return run.columns[plan.columnOffset + plan.componentLayout.indexOf(label)].at(-1)!
}
const stiff = { tension: 1e9, slack: 0, bearing: { kind: 'linear' as const, k: 1e9 } }
const linear = (spec: BuildingSpec) => {
  spec.foundationAnchorage = stiff
  spec.storeys.forEach((s) => { s.anchorage = stiff; s.walls.forEach((w) => { w.layout.sheathing = { law: { kind: 'linear', ga: 11000 } } }) })
}

describe('stud-wall building template', () => {
  // Piers are full-height runs between king studs; widths use the opening-edge coordinates exactly.
  it('derives two king-stud piers beside centered windows on each front/back wall', () => {
    const walls = studBuildingSpec().spec.storeys[0].walls
    expect(wallPiers(walls[0].layout).map((p) => p.width)).toEqual([3400, 3400])
    expect(wallPiers({ ...walls[0].layout, openings: [] })).toHaveLength(1)
  })

  // The expansion becomes ordinary entities: Z-up nodes, walls with their stations, anchorage links, constraints, named patterns.
  it('expands into ordinary nodes, walls, links, constraints and load patterns', () => {
    const { model } = make({ storeys: 2 })
    const walls = [...model.elements.values()].filter((e) => e.eleType === 'studWall')
    expect(walls).toHaveLength(8)
    expect([...model.elements.values()].some((e) => e.eleType === 'zeroLength')).toBe(true)
    expect([...model.materials.values()].some((m) => m.matType === 'Anchorage')).toBe(true)
    expect([...model.mpConstraints.values()].map((c) => c.kind)).toContain('rigidDiaphragm')
    expect([...model.patterns.values()].map((p) => p.name)).toEqual(['Dead', 'Live', 'Snow', 'Wind'])
    expect(Math.max(...[...model.nodes.values()].map((n) => n.coords[2]))).toBeCloseTo(2 * (2440 + 254))
    const front = model.elements.get(wallId(model, 'S1 front'))!
    expect(front.nodes).toHaveLength(4 + studWallArgs(front.args).stations.length)
  })

  it('compiles and runs the default building in the bundled Carapace wasm', () => {
    const { model, history } = make()
    const compile = compileInputV1(model, history)
    expect(compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(compile.input?.studWalls).toHaveLength(12)
    expect(compile.input?.floorLoads?.length).toBeGreaterThan(0)
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    expect(run.times.length).toBeGreaterThan(0)
  })

  it('runs a flexible-diaphragm building', () => {
    const { model, history } = make({ diaphragm: 'flexible', storeys: 1, windowWidth: 0, sheathing: 'linear', steps: 1, deadFloor: 0, liveFloor: 0, deadRoof: 0, snow: 0 }, linear)
    expect(runCarapace(model, history).error).toBeNull()
  })

  // Symmetric window box, rigid diaphragm: each X wall takes half of each storey shear (statics, 1e-6).
  it('uses the symmetric rigid-diaphragm split with linear sheathing and anchorage', () => {
    const { model, history } = make({ storeys: 2, sheathing: 'linear', lateralDirection: 'x', eccentricity: 0, deadFloor: 0, liveFloor: 0, deadRoof: 0, snow: 0 }, (spec) => {
      linear(spec)
      spec.storeys.forEach((s) => { s.bandGa = 1e9; s.rimEa = 1e12; s.bearing = 1e9; s.walls.forEach((w) => { w.layout.topEa = w.layout.topEi = w.layout.bottomEa = w.layout.bottomEi = 1e12 }) })
    })
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    for (let si = 0; si < 2; si++) {
      for (const wall of ['front', 'back']) {
        const shear = Math.abs(last(run, wallId(model, `S${si + 1} ${wall}`), 'shear'))
        const expected = si === 0 ? 30000 : 20000 // F_i ∝ h_i = (H + d)(i + 1): 20 and 40 kN, half to each X wall
        expect(Math.abs(shear - expected), `storey ${si + 1} ${wall}: ${shear} vs ${expected}`).toBeLessThan(expected * 1e-6)
      }
      for (const wall of ['left', 'right']) expect(Math.abs(last(run, wallId(model, `S${si + 1} ${wall}`), 'shear'))).toBeLessThan(1e-3)
    }
  })

  // Base overturning with the O86 Fig. 11.7 levers to the top of each floor zone, 10 kN per level (statics, 1e-6).
  it('matches the two-storey front-wall base overturning statics', () => {
    const { model, history } = make({ storeys: 2, length: 4000, width: 4000, studSpacing: 2000, noWindows: true, sheathing: 'linear', lateralShear: 20000, deadFloor: 0, liveFloor: 0, deadRoof: 0, snow: 0 }, (spec) => {
      linear(spec)
      spec.storeys.forEach((s) => { s.bandGa = 1e9; s.rimEa = 1e12; s.bearing = 1e9; s.floors = []; s.lateral = [{ slot: 3, fx: 10000, fz: 0, at: [2000, 2000] }]; s.walls.forEach((w) => { w.loads = []; w.layout.topEa = w.layout.topEi = w.layout.bottomEa = w.layout.bottomEi = 1e12 }) })
    })
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    const got = Math.abs(last(run, wallId(model, 'S1 front'), 'p1.momentBase')), h = 2440, d = 254
    const expected = 5000 * 2 * (h + d) + 5000 * (h + d)
    expect(Math.abs(got - expected)).toBeLessThan(expected * 1e-6)
  })

  // Rigid-body torsion gives the back X wall the larger shear for positive X force applied at positive Y eccentricity.
  it('gives the expected sign for eccentric lateral loading', () => {
    const { model, history } = make({ storeys: 1, sheathing: 'linear', lateralDirection: 'x', eccentricity: 10, deadRoof: 0, snow: 0 }, linear)
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    expect(Math.abs(last(run, wallId(model, 'S1 back'), 'shear'))).toBeGreaterThan(Math.abs(last(run, wallId(model, 'S1 front'), 'shear')))
  })

  // Gravity takedown at 1.0D: one-way floors put w·Lx·Ly/2 of every level at or above a storey on each X wall's base; the side walls carry none (1e-6).
  it('takes the floor dead loads down the front and back walls', () => {
    const { model, history, p } = make({ storeys: 3, lateralShear: 0, combination: '1.0D', factors: [1, 0, 0, 0, 0, 0, 0, 0] })
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    for (let si = 0; si < 3; si++) {
      const expected = [...Array(3 - si)].map((_, k) => (si + k === 2 ? p.deadRoof : p.deadFloor)).reduce((a, w) => a + w * p.length * p.width / 2, 0)
      for (const wall of ['front', 'back']) {
        const axial = last(run, wallId(model, `S${si + 1} ${wall}`), 'axial')
        expect(Math.abs(axial - expected), `storey ${si + 1} ${wall}: ${axial} vs ${expected}`).toBeLessThan(expected * 1e-6)
      }
      for (const wall of ['left', 'right']) expect(Math.abs(last(run, wallId(model, `S${si + 1} ${wall}`), 'axial'))).toBeLessThan(1e-3)
    }
  })

  it('round-trips through a saved project', () => {
    const { model, history } = make({ storeys: 2 })
    const doc = captureProject({ model, analysisHistory: history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null, viewSettings: {}, unitPrefs: { force: 'kN' }, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW })
    const opened = parseProject(serializeProject(doc))
    expect(opened.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const m = opened.project!.model
    for (const key of ['nodes', 'elements', 'materials', 'fixes', 'mpConstraints', 'patterns'] as const) expect(m[key], key).toEqual(model[key])
  })

  // OpenSees gets elastic shells for the walls, floor reactions as nodal loads, and the Carapace-only items flagged.
  it('exports walls as elastic shells with warnings', () => {
    const { model, history } = make({ storeys: 1 })
    const text = exportScript(model, history)
    expect(text).toContain("ops.element('ShellMITC4'")
    expect(text).toContain("ops.section('ElasticMembranePlateSection'")
    expect(text).toMatch(/WARNING: stud wall \d+ \(S1 front\) is Carapace-only/)
    expect(text).toContain('WARNING: Anchorage material')
    expect(text).toContain('WARNING: Carapace-only floor load')
    expect(text).not.toContain('studWall')
  })

  // The total floor reaction written to OpenSees equals the floor load (statics), and real OpenSees accepts the script.
  it.runIf(opensesAvailable)('runs the exported building in OpenSees', () => {
    const { model, history, p } = make({ storeys: 1, combination: '1.0D', factors: [1, 0, 0, 0, 0, 0, 0, 0], lateralShear: 0 })
    const dead = [...model.patterns.values()].find((pat) => pat.name === 'Dead')!
    const total = dead.children.flatMap((c) => (c.kind === 'floorLoad' ? floorLoadNodal(model, c) : [])).reduce((s, call) => s + Number(call.args[3]), 0)
    const text = exportScript(model, history)
    expect(Math.abs(-total - p.deadRoof * p.length * p.width)).toBeLessThan(1e-6 * p.deadRoof * p.length * p.width)
    const out = runOpenSees(text)
    expect(out.failures).toEqual([])
    expect(out.ok).toBe(true)
  }, 120_000)
})
