import { describe, expect, it } from 'vitest'
import { emptyAnalysisHistory } from '@/app/types/analysisCommands'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { studBuildingTemplate, wallPiers } from '@/app/lib/studBuilding'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { emptyModel } from '@/app/types/model'
import { exportScript } from '@/app/lib/exportScript'
import { serializeProject } from '@/app/lib/project/serialize'
import { parseProject } from '@/app/lib/project/parse'
import { captureProject } from '@/app/lib/project/types'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'

const make = (params = {}) => applyModelWrite({ ...emptyModel(), config: { ndm: 3, ndf: 6, units: { length: 'mm', force: 'N', time: 's' } } }, { kind: 'building', entity: studBuildingTemplate(params) })
const history = emptyAnalysisHistory()

describe('stud-wall building template', () => {
  // Piers are full-height runs between king studs; widths use the opening-edge coordinates exactly.
  it('derives two king-stud piers beside centered windows on each front/back wall', () => {
    const walls = studBuildingTemplate().spec.storeys[0].walls
    expect(wallPiers(walls[0].layout).map((p) => p.width)).toEqual([3400, 3400])
    expect(wallPiers({ ...walls[0].layout, openings: [] })).toHaveLength(1)
  })

  // The bundled wasm and input-v1 example define the completed native building run and static recorder contract.
  it('compiles and runs the default building in the bundled Carapace wasm', () => {
    const model = make()
    const compile = compileInputV1(model, history)
    expect(compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(compile.input).toMatchObject({ header: { ndm: 3 }, building: model.building!.spec })
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    expect(run.times.length).toBeGreaterThan(0)
  })

  // Building loads live in their spec; an authored analysis history is preserved by projects but ignored by its generated stage.
  it('reports ignored analysis commands for building models', () => {
    const analysis = { commands: [{ type: 'ANALYSIS_OPS', fn: 'wipeAnalysis', values: {} }], cursor: 0 } as const
    const compile = compileInputV1(make(), analysis as never)
    expect(compile.diagnostics.some((d) => d.severity === 'info' && d.message.includes('ignored'))).toBe(true)
    expect(compile.input?.sequence.stages).toHaveLength(1)
  })

  // Flexible levels have no master node, so input-format.md requires no buildingStoreyDrift recorders.
  it('compiles flexible diaphragms without drift recorders and still runs', () => {
    const model = make({ diaphragm: 'flexible', storeys: 1, windowWidth: 0, sheathing: 'linear', steps: 1, deadFloor: 0, liveFloor: 0, deadRoof: 0, snow: 0 })
    model.building!.spec.foundationAnchorage = { tension: 1e9, slack: 0, bearing: { kind: 'linear', k: 1e9 } }; model.building!.spec.storeys[0].anchorage = model.building!.spec.foundationAnchorage; model.building!.spec.storeys[0].walls.forEach((w) => { w.layout.sheathing = { law: { kind: 'linear', ga: 11000 } } })
    const compile = compileInputV1(model, history)
    expect(compile.input?.sequence.recorders.some((r) => r.response === 'buildingStoreyDrift')).toBe(false)
    expect(runCarapace(model, history).error).toBeNull()
  })

  // Symmetric window box, rigid diaphragm: each X wall takes half of each storey shear (statics, 1e-6).
  it('uses the symmetric rigid-diaphragm split with linear sheathing and anchorage', () => {
    const entity = studBuildingTemplate({ storeys: 2, sheathing: 'linear', lateralDirection: 'x', eccentricity: 0, deadFloor: 0, liveFloor: 0, deadRoof: 0, snow: 0 })
    for (const s of entity.spec.storeys) { s.anchorage = { tension: 1e9, slack: 0, bearing: { kind: 'linear', k: 1e9 } }; s.bandGa = 1e9; s.rimEa = 1e12; s.bearing = 1e9; s.walls.forEach((w) => { w.layout.sheathing = { law: { kind: 'linear', ga: 11000 } }; w.layout.topEa = w.layout.topEi = w.layout.bottomEa = w.layout.bottomEi = 1e12 }) }
    entity.spec.foundationAnchorage = { tension: 1e9, slack: 0, bearing: { kind: 'linear', k: 1e9 } }
    const model = applyModelWrite({ ...emptyModel(), config: { ndm: 3, ndf: 6 } }, { kind: 'building', entity })
    const run = runCarapace(model, history)
    expect(run.error).toBeNull()
    const recs = run.compile.input!.sequence.recorders
    for (let si = 0; si < 2; si++) for (const wall of ['front', 'back']) {
      const ids = recs.map((r, i) => r.response === 'buildingWallPier' && r.storey === si && r.wall === wall && r.quantity === 'q' ? i : -1).filter((i) => i >= 0)
      const layouts = entity.spec.storeys[si].walls.find((w) => w.name === wall)!.layout
      const widths = wallPiers(layouts).map((p) => p.width)
      const shear = ids.reduce((sum, id, i) => sum + Math.abs(run.columns[id].at(-1) ?? 0) * widths[i], 0)
      const expected = si === 0 ? 30000 : 20000 // F_i ∝ h_i = (H + d)(i + 1): 20 and 40 kN, half to each X wall
      expect(Math.abs(shear - expected), `storey ${si + 1} ${wall}: ${shear} vs ${expected}`).toBeLessThan(expected * 1e-6)
    }
    for (let si = 0; si < 2; si++) for (const wall of ['left', 'right']) {
      const ids = recs.map((r, i) => r.response === 'buildingWallPier' && r.storey === si && r.wall === wall && r.quantity === 'q' ? i : -1).filter((i) => i >= 0)
      expect(ids.reduce((sum, id) => sum + Math.abs(run.columns[id].at(-1) ?? 0), 0)).toBeLessThan(1e-5)
    }
  })

  // Base overturning with the O86 Fig. 11.7 levers to the top of each band, 10 kN per level (statics, 1e-6).
  it('matches the two-storey front-wall base overturning statics', () => {
    const entity = studBuildingTemplate({ storeys: 2, length: 4000, width: 4000, studSpacing: 2000, noWindows: true, sheathing: 'linear', lateralShear: 20000, deadFloor: 0, liveFloor: 0, deadRoof: 0, snow: 0 })
    const stiff = { tension: 1e9, slack: 0, bearing: { kind: 'linear' as const, k: 1e9 } }
    entity.spec.foundationAnchorage = stiff
    entity.spec.storeys.forEach((s) => { s.anchorage = stiff; s.bandGa = 1e9; s.rimEa = 1e12; s.bearing = 1e9; s.floors = []; s.walls.forEach((w) => { w.loads = []; w.layout.sheathing = { law: { kind: 'linear', ga: 11000 } }; w.layout.topEa = w.layout.topEi = w.layout.bottomEa = w.layout.bottomEi = 1e12 }) })
    entity.spec.storeys.forEach((s) => { s.lateral = [{ slot: 3, fx: 10000, fz: 0, at: [2000, 2000] }] })
    const run = runCarapace(applyModelWrite({ ...emptyModel(), config: { ndm: 3, ndf: 6 } }, { kind: 'building', entity }), history)
    expect(run.error).toBeNull()
    const recs = run.compile.input!.sequence.recorders
    const index = recs.findIndex((r) => r.response === 'buildingWallPier' && r.storey === 0 && r.wall === 'front' && r.pier === 0 && r.quantity === 'momentBase')
    const got = Math.abs(run.columns[index].at(-1) ?? 0), h = 2440, d = 254
    const expected = 5000 * 2 * (h + d) + 5000 * (h + d) // forces at the top of each band, roof band included
    expect(Math.abs(got - expected)).toBeLessThan(expected * 1e-6)
  })

  // Rigid-body torsion gives the back X wall the larger shear for positive X force applied at positive Z eccentricity.
  it('gives the expected sign for eccentric lateral loading', () => {
    const entity = studBuildingTemplate({ storeys: 1, sheathing: 'linear', lateralDirection: 'x', eccentricity: 10, deadRoof: 0, snow: 0 })
    const stiff = { tension: 1e9, slack: 0, bearing: { kind: 'linear' as const, k: 1e9 } }
    entity.spec.foundationAnchorage = stiff
    entity.spec.storeys[0].anchorage = stiff
    entity.spec.storeys[0].walls.forEach((w) => { w.layout.sheathing = { law: { kind: 'linear', ga: 11000 } } })
    const run = runCarapace(applyModelWrite({ ...emptyModel(), config: { ndm: 3, ndf: 6 } }, { kind: 'building', entity }), history)
    expect(run.error).toBeNull()
    const recs = run.compile.input!.sequence.recorders
    const lineShear = (name: string) => recs.reduce((sum, r, i) => r.response === 'buildingWallPier' && r.storey === 0 && r.wall === name && r.quantity === 'q' ? sum + Math.abs(run.columns[i].at(-1) ?? 0) * wallPiers(entity.spec.storeys[0].walls.find((w) => w.name === name)!.layout)[r.pier].width : sum, 0)
    expect(lineShear('back')).toBeGreaterThan(lineShear('front'))
  })

  // Gravity takedown at 1.0D: Z-span floors put w·Lx·Lz/2 of every level at or above a storey on each X wall's base; the side walls carry none (statics, 1e-6).
  it('takes the floor dead loads down the front and back walls', () => {
    const entity = studBuildingTemplate({ storeys: 3, lateralShear: 0, combination: '1.0D', factors: [1, 0, 0, 0, 0, 0, 0, 0] })
    const run = runCarapace(applyModelWrite({ ...emptyModel(), config: { ndm: 3, ndf: 6 } }, { kind: 'building', entity }), history)
    expect(run.error).toBeNull()
    const recs = run.compile.input!.sequence.recorders
    const axial = (storey: number, wall: string) => run.columns[recs.findIndex((r) => r.response === 'buildingWallBase' && r.storey === storey && r.wall === wall && r.component === 'axial')].at(-1)!
    const { deadFloor, deadRoof, length, width } = { ...entity.template! }
    for (let si = 0; si < 3; si++) {
      const levels = [...Array(3 - si)].map((_, k) => (si + k === 2 ? deadRoof : deadFloor))
      const expected = levels.reduce((a, w) => a + w * length * width / 2, 0)
      for (const wall of ['front', 'back']) expect(Math.abs(axial(si, wall) - expected), `storey ${si + 1} ${wall}: ${axial(si, wall)} vs ${expected}`).toBeLessThan(expected * 1e-6)
      for (const wall of ['left', 'right']) expect(Math.abs(axial(si, wall))).toBeLessThan(1e-3)
    }
  })

  // building.md documents the exclusive building input and project annotations preserve the full authored entity.
  it('round-trips the building project directive and refuses OpenSees export', () => {
    const model = make()
    const doc = captureProject({ model, analysisHistory: history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null, viewSettings: {}, unitPrefs: { force: 'kN' }, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW })
    const text = serializeProject(doc), opened = parseProject(text)
    expect(opened.project?.model.building).toEqual(model.building)
    expect(() => exportScript(model, history)).toThrow('Stud-wall buildings run in Carapace only')
  })
})
