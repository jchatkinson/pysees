import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { runCarapace, type CarapaceRun } from '@/app/lib/commands/carapaceRunner'
import { studBuildingSpec, wallPiers } from '@/app/lib/studBuilding'
import { drawStudWall, expansionToModel, rebuildStudWall, studWallArgs, studWallTemplateOf, unanchoredPierEnds } from '@/app/lib/studWalls'
import { DrawBatch } from '@/app/lib/editor/draw'
import { assignDiaphragms } from '@/app/lib/editor/edit'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { exportScript } from '@/app/lib/exportScript'
import { serializeProject } from '@/app/lib/project/serialize'
import { buildSceneIndex } from '@/app/components/r3f/sceneIndex'
import { fillDiagram } from '@/app/components/r3f/diagrams'
import { createExtremaAccumulator } from '@/app/lib/resultsExtrema'
import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import { applyFraming, guessFraming, lumberScale } from '@/app/lib/lumber'
import { parseProject } from '@/app/lib/project/parse'
import { captureProject } from '@/app/lib/project/types'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { floorLoadNodal, wallLoadNodal } from '@/app/lib/studWallExport'
import { wallLoadArgs } from '@/app/lib/shells'
import { validateSchemaResult } from '@/app/lib/commandSchemas'
import { assignFlexibleDiaphragms, removeFlexibleDiaphragms } from '@/app/lib/diaphragms'
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

  // A wall load (top line plus a point, local axes) goes down the loaded wall in Carapace, and exports as nodal loads with the same total.
  it('applies wall loads in Carapace and exports them as nodal loads', () => {
    const { model, history, p } = make({ storeys: 1, combination: '1.0D', factors: [1, 0, 0, 0, 0, 0, 0, 0], lateralShear: 0 }, linear)
    const front = wallId(model, 'S1 front')
    const dead = [...model.patterns.values()].find((pat) => pat.name === 'Dead')!
    const children = [
      { kind: 'eleLoad' as const, args: wallLoadArgs([front], { kind: 'topLine', x0: 0, x1: p.length, wx0: 0, wx1: 0, wy0: -2, wy1: -4 }) },
      { kind: 'eleLoad' as const, args: wallLoadArgs([front], { kind: 'topPoint', x: p.length / 4, fx: 0, fy: -5000 }) },
    ]
    const check = (args: Record<string, unknown>) => validateSchemaResult({ target: 'model', write: { kind: 'patternChild', patternId: dead.id, child: { kind: 'eleLoad', args } } }, model, { ndm: 3, ndf: 6 })
    expect(check(children[0].args)).toBeNull()
    expect(check({ eleTags: [front], wx: 0, wy: -1, wz: 0 })).toMatch(/wall loads/)
    const link = [...model.elements.values()].find((e) => e.eleType === 'zeroLength')!.id
    expect(check(wallLoadArgs([link], { kind: 'topPoint', x: 0, fx: 0, fy: -1 }))).toMatch(/stud walls only/)
    model.patterns.set(dead.id, { ...dead, children })
    const total = 3 * p.length + 5000
    const run = runCarapace(model, history)
    expect(run.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(run.compile.input?.elementLoads?.load.filter((l) => l.kind === 'wallLoad')).toHaveLength(2)
    const axial = [...model.elements.values()].filter((e) => e.eleType === 'studWall').reduce((s, e) => s + last(run, e.id, 'axial'), 0)
    expect(axial).toBeCloseTo(total, 3)
    expect(last(run, front, 'axial')).toBeGreaterThan(0.95 * total)
    const exported = children.flatMap((c) => wallLoadNodal(model, c)).reduce((s, call) => s + Number(call.args[3]), 0)
    expect(exported).toBeCloseTo(-total, 6)
    expect(exportScript(model, history)).toContain('WARNING: Carapace-only wall load (top line)')
    const doc = captureProject({ model, analysisHistory: history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null, viewSettings: {}, unitPrefs: {}, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW })
    const opened = parseProject(serializeProject(doc))
    expect(opened.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(opened.project!.model.patterns.get(dead.id)?.children).toEqual(children)
  })

  // Editing a layout rebuilds the wall's stations: linked bottom stations stay, new pier ends get stations (and a hold-down warning).
  it('rebuilds stations when a layout changes', () => {
    const { model, history } = make({ storeys: 1 }, linear)
    expect(runCarapace(model, history).compile.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    const front = wallId(model, 'S1 front'), left = wallId(model, 'S1 left')
    // No window: one pier; the bottom stations at the old pier ends still carry their anchorage links, so they stay.
    const before = model.elements.get(front)!
    const plain = { ...studWallArgs(before.args).layout, openings: [] }
    const a = rebuildStudWall(model, front, plain)
    const wall = a.model.elements.get(front)!
    expect(studWallArgs(wall.args).stations.filter((st) => st.chord === 'bottom')).toEqual(studWallArgs(before.args).stations.filter((st) => st.chord === 'bottom'))
    expect(a.added).toEqual([])
    const run = runCarapace(a.model, history)
    expect(run.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(run.error).toBeFalsy(); expect(run.times.length).toBeGreaterThan(0)
    // A window in the side wall: two new pier ends with bottom stations and no hold-down.
    const side = studWallArgs(model.elements.get(left)!.args).layout
    const L = side.length, x0 = L / 2 - 400, x1 = L / 2 + 400
    const studs = [...side.studs.filter((st) => st.x !== x0 && st.x !== x1), { x: x0, ea: side.studs[1].ea }, { x: x1, ea: side.studs[1].ea }].sort((p, q) => p.x - q.x)
    const b = rebuildStudWall(model, left, { ...side, studs, openings: [{ x0, x1, headHeight: 2000, headerEi: 1e12, jackEa: side.studs[1].ea, door: false }] })
    expect(unanchoredPierEnds(b.model, b.model.elements.get(left)!)).toEqual([x0, x1])
    expect(b.added.length).toBeGreaterThanOrEqual(2)
    const run2 = runCarapace(b.model, history)
    expect(run2.compile.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('no hold-down'))).toBe(true)
    expect(run2.error).toBeFalsy(); expect(run2.times.length).toBeGreaterThan(0)
    // Back to the original layout: the added nodes go again.
    const c = rebuildStudWall(b.model, left, side)
    expect(b.added.every((n) => !c.model.nodes.has(n))).toBe(true)
  })

  // A very stiff flexible diaphragm in place of the rigid one gives the rigid wall shears (the master's loads move onto the grid).
  it('replaces a rigid diaphragm with a flexible one', () => {
    const { model, history, p } = make({ storeys: 1, combination: 'W', factors: [0, 0, 0, 1, 0, 0, 0, 0], lateralShear: 50000, lateralDirection: 'x', eccentricity: 20 }, linear)
    const rd = [...model.mpConstraints.values()].find((c) => c.kind === 'rigidDiaphragm')!
    const top = (rd.args.cNodeTags as number[]).map(Number)
    const shears = (m: Model) => { const run = runCarapace(m, history); expect(run.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([]); expect(run.error).toBeFalsy(); return ['S1 front', 'S1 back'].map((w) => last(run, wallId(m, w), 'shear')) }
    const rigid = shears(model)
    expect(Math.abs(rigid[0]) + Math.abs(rigid[1])).toBeCloseTo(p.lateralShear, 0)
    const flex = (ga: number) => {
      const r = assignFlexibleDiaphragms(model, top, { law: { kind: 'linear', ga }, chordEa: 1e12, interiorEa: 1e12 })
      expect(r.diaphragms).toBe(1)
      // The rigid diaphragm goes; each coincident corner node of a perpendicular wall is tied to its grid node in plan.
      const ties = [...r.model.mpConstraints.values()].filter((c) => !model.mpConstraints.has(c.id))
      expect(r.model.mpConstraints.size).toBe(model.mpConstraints.size - 1 + ties.length)
      expect(ties.length).toBeGreaterThan(0)
      expect(ties.every((c) => c.kind === 'equalDOF')).toBe(true)
      return r.model
    }
    const stiff = shears(flex(1e12))
    stiff.forEach((v, i) => expect(v).toBeCloseTo(rigid[i], -1))
    // Round trip and export.
    const m = flex(5000)
    const soft = shears(m)
    expect(Math.abs(soft[0]) + Math.abs(soft[1])).toBeCloseTo(p.lateralShear, 0)
    const text = exportScript(m, history)
    expect(text).toMatch(/WARNING: flexible diaphragm \d+ is Carapace-only/)
    const doc = captureProject({ model: m, analysisHistory: history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null, viewSettings: {}, unitPrefs: {}, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW })
    const opened = parseProject(serializeProject(doc))
    expect(opened.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    for (const key of ['nodes', 'elements', 'fixes', 'mpConstraints'] as const) expect(opened.project!.model[key], key).toEqual(m[key])
    if (opensesAvailable) { const out = runOpenSees(text); expect(out.failures).toEqual([]); expect(out.ok).toBe(true) }
    // Removing it leaves no stray grid nodes.
    const removed = removeFlexibleDiaphragms(m, top)
    expect([...removed.elements.values()].some((e) => e.eleType === 'diaphragm')).toBe(false)
    expect(removed.mpConstraints.size).toBe(model.mpConstraints.size - 1)
    // Grid nodes go unless they now carry the lateral load moved from the old master.
    const loaded = new Set([...removed.patterns.values()].flatMap((pat) => pat.children.map((c) => Number(c.args.nodeTag))))
    expect([...removed.nodes.keys()].filter((n) => !model.nodes.has(n)).every((n) => loaded.has(n))).toBe(true)
    expect(removed.nodes.has(Number(rd.args.rNodeTag))).toBe(false)
  }, 120_000)

  // The wall tool: walls like an existing one, held down to the ground below and to the wall below above that; they take shear once in a diaphragm.
  it('draws stud walls with hold-downs', () => {
    const { model, history, p } = make({ storeys: 2, combination: 'W', factors: [0, 0, 0, 1, 0, 0, 0, 0], lateralShear: 50000, lateralDirection: 'z' }, linear)
    const t = studWallTemplateOf(model, model.elements.get(wallId(model, 'S1 left'))!)!
    expect(t.anchorage).toBeDefined()
    expect(t.floor?.depth).toBe(p.floorDepth)
    const storey = p.wallHeight + p.floorDepth, x = p.length / 2
    const b = new DrawBatch(model)
    const w1 = drawStudWall(b, [x, 0], [x, p.width], 0, storey, t, 'S1 mid')!
    const w2 = drawStudWall(b, [x, 0], [x, p.width], storey, 2 * storey, t, 'S2 mid')!
    const m = b.model
    expect(unanchoredPierEnds(m, m.elements.get(w1)!)).toEqual([])
    expect(unanchoredPierEnds(m, m.elements.get(w2)!)).toEqual([])
    // Drawn walls carry the source wall's lumber (read from its EAs) and the same stud EA.
    expect(studWallArgs(m.elements.get(w1)!.args).framing).toMatchObject({ grade: 'o86-spf', stud: '2x6', endPlies: 3, openings: [] })
    expect(studWallArgs(m.elements.get(w1)!.args).layout.studs[1].ea).toBeCloseTo(t.studEa, 3)
    // Re-assign the rigid diaphragms over every wall's top nodes, including the new ones.
    const tops = [...m.elements.values()].filter((e) => e.eleType === 'studWall').flatMap((e) => [e.nodes[2], e.nodes[3], ...studWallArgs(e.args).stations.flatMap((st, i) => (st.chord === 'top' ? [e.nodes[4 + i]] : []))])
    const masters = [...m.mpConstraints.values()].filter((c) => c.kind === 'rigidDiaphragm').map((c) => Number(c.args.rNodeTag))
    // Keep the storey forces: move them from the old masters to the new ones afterwards.
    const r = assignDiaphragms(m, tops)
    expect(r.diaphragms).toBe(2)
    const newMasters = [...r.model.mpConstraints.values()].filter((c) => c.kind === 'rigidDiaphragm').map((c) => Number(c.args.rNodeTag))
    const moved = { ...r.model, patterns: new Map([...r.model.patterns].map(([id, pat]) => [id, { ...pat, children: pat.children.map((c) => (c.kind === 'load' && masters.includes(Number(c.args.nodeTag)) ? { ...c, args: { ...c.args, nodeTag: newMasters[masters.indexOf(Number(c.args.nodeTag))] } } : c)) }])) }
    const run = runCarapace(moved, history)
    expect(run.compile.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    expect(run.error).toBeFalsy()
    // Lateral load along Y: the side walls and the new mid wall (all along Y) share it, the mid wall (same stiffness) about a third.
    const shear = (label: string) => Math.abs(last(run, wallId(moved, label), 'shear'))
    expect(shear('S1 left') + shear('S1 right') + shear('S1 mid')).toBeCloseTo(p.lateralShear, 0)
    expect(shear('S1 mid')).toBeGreaterThan(0.25 * p.lateralShear)
    expect(shear('S2 mid')).toBeGreaterThan(0.25 * shear('S1 mid'))
  })

  // The template records the whole model, so a run has a deformed shape, reactions and link forces to show (stud walls add their own resultants).
  it('records displacements, reactions and forces in the template run', () => {
    const { model, history } = make({ storeys: 2 })
    expect(history.commands[0]).toMatchObject({ blockId: 'whole-model-recorder' })
    const run = runCarapace(model, history)
    expect(run.error).toBeFalsy()
    expect(run.compile.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    const kinds = new Set(run.compile.recorderPlans.map((p) => p.kind))
    for (const k of ['disp', 'reaction', 'force', 'studWall'] as const) expect(kinds.has(k), k).toBe(true)
    const roof = Math.max(...[...model.nodes.values()].map((n) => n.coords[2]))
    const top = run.compile.recorderPlans.find((p) => p.kind === 'disp' && model.nodes.get(p.targetTag)!.coords[2] === roof)!
    expect(Math.abs(run.columns[top.columnOffset + top.componentLayout.indexOf('dz')].at(-1)!)).toBeGreaterThan(0)
    // Every wall's base rides on the floor below: tied nodes move together in both plan directions (no wall left behind out of plane).
    const disp = (n: number, l: string) => { const p = run.compile.recorderPlans.find((q) => q.kind === 'disp' && q.targetTag === n)!; return run.columns[p.columnOffset + p.componentLayout.indexOf(l)].at(-1)! }
    const ties = [...model.mpConstraints.values()].filter((c) => c.kind === 'equalDOF')
    expect(ties.length).toBeGreaterThan(0)
    for (const c of ties) {
      expect(c.args.dofs).toEqual([1, 2])
      for (const l of ['dx', 'dy']) expect(disp(Number(c.args.cNodeTag), l)).toBeCloseTo(disp(Number(c.args.rNodeTag), l), 9)
    }
    // The axial diagram draws each pier's chord force on its wall, labelled with the recorded value.
    const index = buildSceneIndex(model.nodes, model.elements, model.geomTransfs, 3)
    expect(index.wallPiers.length).toBe([...model.elements.values()].filter((e) => e.eleType === 'studWall').reduce((n, e) => n + wallPiers(studWallArgs(e.args).layout).length, 0))
    const row = Float64Array.from(run.columns.map((col) => col.at(-1)!))
    const studWall = new Map(run.compile.recorderPlans.filter((p) => p.kind === 'studWall').map((p) => [p.targetTag, { offset: p.columnOffset, labels: p.componentLayout }]))
    const layout = { columns: { disp: new Map(), vel: new Map(), accel: new Map(), reaction: new Map(), force: new Map(), shell: new Map(), studWall } } as unknown as RunLayout
    const n = index.segmentCount * 18
    const out = { fill: new Float32Array(n), fillColor: new Float32Array(n), lines: new Float32Array((index.segmentCount + 2 * index.elementIds.length) * 6) }
    const w = index.wallPiers[0], plan = studWall.get(index.elementIds[w.e])!
    const v = (q: string) => row[plan.offset + plan.labels.indexOf(`p${w.pier}.${q}`)]
    const axial = fillDiagram(index, layout, row, 'axial', 1e-3, out)
    expect(axial.fillVertices).toBe(2 * 6 * index.wallPiers.length)
    expect(axial.labels.slice(0, 2).map((l) => l.value)).toEqual([v('chordLeft'), v('chordRight')])
    // Shear: q × width per pier; moment: base to top.
    const shear = fillDiagram(index, layout, row, 'shear', 1e-3, out)
    expect(shear.labels[0].value).toBeCloseTo(v('q') * w.width, 6)
    const moment = fillDiagram(index, layout, row, 'moment', 1e-6, out)
    expect(moment.labels[0].value).toBe(v('momentBase'))
    expect(moment.fillVertices).toBeGreaterThan(0)
    expect(fillDiagram(index, layout, row, 'torsion', 1e-3, out).fillVertices).toBe(0)
    // The extrema box reads the same pier values.
    const acc = createExtremaAccumulator(index, layout, 'axial', 'mxx' as never)
    acc.add({ step: 9, pseudoTime: 1, row })
    const chords = index.wallPiers.flatMap((p) => { const pl = studWall.get(index.elementIds[p.e])!; return ['chordLeft', 'chordRight'].map((q) => row[pl.offset + pl.labels.indexOf(`p${p.pier}.${q}`)]) })
    expect(acc.result()!.max.value).toBe(Math.max(...chords))
    // Without a recorder block the compiler says why nothing shows.
    expect(runCarapace(model, { commands: history.commands.slice(1), cursor: history.commands.length - 2 }).compile.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'warning', message: expect.stringContaining('Whole Model Recorder') })]))
  })

  // Lumber framing: sizes set the EAs on rebuild, and the framing survives a saved project.
  it('keeps lumber framing through a rebuild and a saved project', () => {
    const { model, history } = make({ storeys: 1 })
    const id = wallId(model, 'S1 front'), e = model.elements.get(id)!
    const { layout } = studWallArgs(e.args), scale = lumberScale(model.config?.units, layout.height)
    const framing = { ...guessFraming(layout, scale), stud: '2x4' }
    const r = rebuildStudWall(model, id, applyFraming(layout, framing, scale), framing)
    const args = studWallArgs(r.model.elements.get(id)!.args)
    expect(args.framing?.stud).toBe('2x4')
    expect(args.layout.studs[1].ea).toBeCloseTo(9500 * 38 * 89, 3)
    const doc = captureProject({ model: r.model, analysisHistory: history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null, viewSettings: {}, unitPrefs: {}, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW })
    const opened = parseProject(serializeProject(doc))
    expect(opened.project!.model.elements.get(id)).toEqual(r.model.elements.get(id))
    expect(runCarapace(r.model, history).error).toBeFalsy()
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
