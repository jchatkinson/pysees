import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { runCarapace, type CarapaceRun } from '@/app/lib/commands/carapaceRunner'
import { readWallMembers, studBuildingSpec, studWallMemberLabels, wallPiers } from '@/app/lib/studBuilding'
import { drawStudWall, expansionToModel, rebuildStudWall, studWallArgs, studWallTemplateOf, unanchoredPierEnds } from '@/app/lib/studWalls'
import { DrawBatch } from '@/app/lib/editor/draw'
import { assignDiaphragms } from '@/app/lib/editor/edit'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { exportScript } from '@/app/lib/exportScript'
import { serializeProject } from '@/app/lib/project/serialize'
import { buildSceneIndex } from '@/app/components/r3f/sceneIndex'
import { fillDiagram } from '@/app/components/r3f/diagrams'
import { createExtremaAccumulator } from '@/app/lib/resultsExtrema'
import { floorTakedown } from '@/app/lib/floors'
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
import type { LoadAssignment, Model, StudBuildingParams } from '@/app/types/model'

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
    // Members view: one bar per member (six vertices), and each wall labels at most its largest tension and compression.
    const memberCount = index.studWalls.reduce((n, w) => { const pl = studWall.get(index.elementIds[w.e])!; return n + readWallMembers(pl.labels, (k) => row[pl.offset + k]).length }, 0)
    const memberBars = fillDiagram(index, layout, row, 'axial', 1e-3, out, 'members')
    expect(memberCount).toBeGreaterThan(0)
    expect(memberBars.fillVertices).toBe(6 * memberCount)
    expect(memberBars.labels.length).toBeLessThanOrEqual(2 * index.studWalls.length)
    const accM = createExtremaAccumulator(index, layout, 'axial', 'mxx' as never, 'members')
    accM.add({ step: 9, pseudoTime: 1, row })
    const all = index.studWalls.flatMap((w) => { const pl = studWall.get(index.elementIds[w.e])!; return readWallMembers(pl.labels, (k) => row[pl.offset + k]).flatMap((m) => [m.bottom, m.top]) })
    expect(accM.result()!.min.value).toBe(Math.min(...all))
    // The extrema box reads the same pier values.
    const acc = createExtremaAccumulator(index, layout, 'axial', 'mxx' as never)
    acc.add({ step: 9, pseudoTime: 1, row })
    const chords = index.wallPiers.flatMap((p) => { const pl = studWall.get(index.elementIds[p.e])!; return ['chordLeft', 'chordRight'].map((q) => row[pl.offset + pl.labels.indexOf(`p${p.pier}.${q}`)]) })
    expect(acc.result()!.max.value).toBe(Math.max(...chords))
    // Member forces: every wall's studs (at their bottom) and jacks carry its base reaction (tension positive, base axial gravity positive).
    for (const p of run.compile.recorderPlans.filter((q) => q.kind === 'studWall')) {
      const members = readWallMembers(p.componentLayout, (k) => run.columns[p.columnOffset + k].at(-1)!)
      const layout = studWallArgs(model.elements.get(p.targetTag)!.args).layout
      expect(members.length * 3 + 3).toBe(studWallMemberLabels(layout).length)
      expect(members.filter((m) => m.kind === 'jack')).toHaveLength(2 * (layout.openings ?? []).length)
      const intoBase = members.filter((m) => m.kind !== 'cripple').reduce((sum, m) => sum + m.bottom, 0)
      const axial = run.columns[p.columnOffset + p.componentLayout.indexOf('axial')].at(-1)!
      expect(intoBase).toBeCloseTo(-axial, 6)
    }
    // Without a recorder block the compiler says why nothing shows.
    expect(runCarapace(model, { commands: history.commands.slice(1), cursor: history.commands.length - 2 }).compile.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'warning', message: expect.stringContaining('Whole Model Recorder') })]))
  })

  // The template's floors are joist floors (outline on the bearing walls' top corners, joists square to them) whose area loads give the
  // same wall takedown as the explicit one-way rows Carapace's building expansion writes.
  it('turns the template floors into joist floors with the same takedown', () => {
    const params = { storeys: 2, combination: '1.0D', factors: [1, 0, 0, 0, 0, 0, 0, 0], lateralShear: 0 }
    const { model, history } = make(params)
    const floors = [...model.elements.values()].filter((e) => e.eleType === 'joistFloor')
    expect(floors).toHaveLength(2)
    for (const f of floors) { expect(f.nodes).toHaveLength(4); expect(Math.abs(Number(f.args.angle) % 180)).toBeCloseTo(90, 9) }
    // The same building with the expansion's explicit rows in place of the floor loads.
    const { spec } = studBuildingSpec(params)
    const { input } = wasm.expandBuilding(spec as never, 'z')
    const explicit = new Map<number, LoadAssignment[]>()
    for (const f of input.floorLoads ?? []) {
      const { pattern, supports, ...rest } = f
      explicit.set(pattern + 1, [...(explicit.get(pattern + 1) ?? []), { kind: 'floorLoad', args: { ...rest, supports: supports.map((x) => ({ ...x, wall: x.wall.index + 1 })) } as unknown as Record<string, unknown> }])
    }
    const legacy = { ...model, elements: new Map([...model.elements].filter(([, e]) => e.eleType !== 'joistFloor')), patterns: new Map([...model.patterns].map(([id, p]) => [id, { ...p, children: [...p.children.filter((c) => c.kind !== 'floorLoad'), ...(explicit.get(id) ?? [])] }])) }
    const a = runCarapace(model, history), b = runCarapace(legacy, history)
    expect(a.compile.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    expect(a.error).toBeFalsy(); expect(b.error).toBeFalsy()
    for (const e of model.elements.values()) if (e.eleType === 'studWall') expect(last(a, e.id, 'axial')).toBeCloseTo(last(b, e.id, 'axial'), 3)
    expect(exportScript(model, history)).toMatch(/WARNING: Carapace-only floor load \(simple one-way spans, joist floor \d+\)/)
    // The card's takedown equals Carapace: the top storey's walls carry exactly the roof floor's reactions (dead load only, factor 1).
    const roof = floors.reduce((hi, f) => (Number(model.nodes.get(f.nodes[0])!.coords[2]) > Number(model.nodes.get(hi.nodes[0])!.coords[2]) ? f : hi))
    const dead = [...model.patterns.values()].find((p) => p.name === 'Dead')!
    const w = dead.children.filter((c) => c.kind === 'floorLoad' && c.args.floor === roof.id).reduce((sum, c) => sum + (c.args.loads as { w: number }[]).reduce((t, l) => t + l.w, 0), 0)
    const takedown = floorTakedown(model, roof.id, new Map([[dead.id, w * Number(dead.args.fact ?? 1)]]))
    expect(takedown.size).toBeGreaterThan(0)
    for (const [wall, m] of takedown) expect(Math.abs(last(a, wall, 'axial'))).toBeCloseTo(m.get(dead.id)!, 3)
    // A floor outline node that lands on no wall (drawn in open plan) is a free node: it must not stop the run.
    const f0 = floors[0], extra = Math.max(...model.nodes.keys()) + 1, c = model.nodes.get(f0.nodes[0])!.coords
    const loose = { ...model, nodes: new Map(model.nodes).set(extra, { id: extra, coords: [c[0] - 500, c[1] - 500, c[2]] }), elements: new Map(model.elements).set(f0.id, { ...f0, nodes: [extra, ...f0.nodes.slice(1)] }) }
    const run = runCarapace(loose, history)
    expect(run.error).toBeFalsy()
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

describe('drawing walls with a hold-down recipe', () => {
  const t = { spacing: 406, studEa: 1e6, endEa: 3e6, topEa: 2e6, topEi: 1e9, topDistribution: 'beam' as const, bottomEa: 1e6, bottomEi: 1e9, law: { kind: 'linear' as const, ga: 2000 }, holdDown: { tension: 15000, k: 1e6 } }

  it('makes bearing walls: the hold-down in the layout, supports at the ends on the ground, no links', () => {
    const b = new DrawBatch(modelFromWrites(3, 6, []))
    const id = drawStudWall(b, [0, 0], [4000, 0], 0, 2700, t)!
    drawStudWall(b, [4000, 0], [4000, 3000], 0, 2700, t)
    const l = studWallArgs(b.model.elements.get(id)!.args).layout
    expect(l.bearing).toEqual({ kv: 1e6, kh: 1e6, holdDown: { tension: 15000, slack: 0, bearing: { kind: 'linear', k: 1e6 } } })
    expect([...b.model.elements.values()].filter((e) => e.eleType === 'zeroLength')).toEqual([])
    expect(b.model.mpConstraints.size).toBe(0)
    // Three supports: the corner at (4000, 0) is shared.
    expect(b.model.fixes.size).toBe(3)
    expect(unanchoredPierEnds(b.model, b.model.elements.get(id)!)).toEqual([])
  })

  it('stands a wall above on the wall below with studs that do not line up, and carries the load down', () => {
    const b = new DrawBatch(modelFromWrites(3, 6, []))
    const real = { ...t, studEa: 5e7, endEa: 1.5e8, topEa: 1e8, bottomEa: 5e7 } // 2x6 SPF EAs (N): the studs barely shorten
    const lower = drawStudWall(b, [0, 0], [4000, 0], 0, 2700, real)!
    const upper = drawStudWall(b, [0, 0], [4000, 0], 2700, 5400, { ...real, spacing: 300 })!
    const p = b.model.nextIds.pattern
    b.writeRaw({ kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } })
    b.writeRaw({ kind: 'pattern', entity: { id: p, patternType: 'Plain', args: { type: 'Plain', patternTag: p, tsTag: 1, fact: 1 }, children: [] } })
    b.writeRaw({ kind: 'patternChild', patternId: p, child: { kind: 'eleLoad', args: wallLoadArgs([upper], { kind: 'topLine', x0: 0, x1: 4000, wx0: 0, wx1: 0, wy0: -5, wy1: -5 }) } })
    const model = b.model
    const top = (id: number) => { const e = model.elements.get(id)!; return e.nodes[3] }
    expect(top(lower)).toBeDefined()
    const history = { commands: [{ type: 'ANALYSIS_BLOCK' as const, blockId: 'whole-model-recorder', params: { directory: 'out' } }, { type: 'ANALYSIS_BLOCK' as const, blockId: 'run-gravity-analysis', params: { patterns: [p], steps: 1, holdLoads: 'Yes', algorithm: 'Newton', tol: 1e-9, maxIter: 50 } }], cursor: 1 }
    const run = runCarapace(model, history)
    expect(run.compile.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    expect(run.error).toBeFalsy()
    const row = run.compile.input!.studWalls![1]
    // The upper wall stands on every top node of the lower one.
    expect(row.stations.filter((s) => s.chord === 'base')).toHaveLength(studWallArgs(model.elements.get(lower)!.args).stations.filter((s) => s.chord === 'top').length + 2)
    const reactions = run.compile.recorderPlans.filter((q) => q.kind === 'reaction' && model.fixes.has(q.targetTag))
    const sum = reactions.reduce((s, q) => s + (run.columns[q.columnOffset + 2].at(-1) ?? 0), 0)
    expect(sum / (5 * 4000)).toBeCloseTo(1, 6)
    // The upper wall's top barely moves: it is carried along its length, not only at its ends.
    const disp = run.compile.recorderPlans.filter((q) => q.kind === 'disp')
    const uz = disp.map((q) => run.columns[q.columnOffset + 2].at(-1) ?? 0)
    expect(Math.min(...uz)).toBeGreaterThan(-1)
  }, 60_000)
})
