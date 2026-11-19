import { describe, expect, it } from 'vitest'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { precastWallTemplate, type PrecastWallParams } from '@/app/lib/templates'
import type { Model } from '@/app/types/model'

const KIP = 4448.2216, IN = 0.0254, FT = 0.3048

const build = (p: Partial<PrecastWallParams> = {}) => {
  const t = precastWallTemplate(p)
  return { t, model: modelFromWrites(t.ndm, t.ndf, t.writes), history: { commands: t.analysisCommands, cursor: t.analysisCommands.length - 1 } }
}
const elements = (model: Model, eleType: string, match?: (args: Record<string, unknown>) => boolean) => [...model.elements.values()].filter((e) => e.eleType === eleType && (!match || match(e.args)))
const isConnector = (a: Record<string, unknown>) => Array.isArray(a.dir) && a.dir.length === 2 && a.dir[0] === 1 && a.dir[1] === 2

describe('precast wall template: the study\'s model', () => {
  it('has the same topology as the study: 260 nodes, 299 elements', () => {
    const { model } = build()
    expect(model.nodes.size).toBe(260)
    expect(model.elements.size).toBe(299)
    expect(elements(model, 'DispBeamColumn').length).toBe(4 * 15) // 2 splice elements and 13 above, per panel
    expect(elements(model, 'ElasticBeamColumn').length).toBe(152) // 14 pairs of arms per panel, and a 10-segment base beam
    expect(elements(model, 'zeroLength').length).toBe(87)
  })

  it('puts a node at the base, the top of the 5 ft splice, 13 connector elevations (H/14 apart) and the roof', () => {
    const { model } = build()
    const ys = [...new Set([...model.nodes.values()].filter((n) => Math.abs(n.coords[0] - 1.524) < 1e-9).map((n) => Number((n.coords[1] / FT).toFixed(3))))].sort((a, b) => a - b)
    expect(ys).toEqual([0, 2.714, 5, 5.429, 8.143, 10.857, 13.571, 16.286, 19, 21.714, 24.429, 27.143, 29.857, 32.571, 35.286, 38])
  })

  it('has 13 connectors per joint, each an elastic axial and a Steel02 shear material between coincident nodes', () => {
    const { model } = build()
    const connectors = elements(model, 'zeroLength', isConnector)
    expect(connectors.length).toBe(3 * 13)
    for (const e of connectors) {
      const [a, b] = e.nodes.map((id) => model.nodes.get(id)!.coords)
      expect(a).toEqual(b)
      const shear = model.materials.get(Number((e.args.mat as number[])[1]))!
      expect(shear.matType).toBe('Steel02')
      expect(Number(shear.args.fy)).toBeCloseTo(44 * KIP, 0)
      expect(Number(shear.args.e0) / (300 * KIP / IN)).toBeCloseTo(1, 9)
      expect(shear.args.b).toBe(0.001)
    }
  })

  it('stands each panel on 11 bearings: 2 friction bearings at the edges, ENT inside, and dowels 1 ft from each edge in parallel with the bearing', () => {
    const { model } = build()
    const friction = elements(model, 'zeroLength', (a) => a.friction !== undefined)
    expect(friction.length).toBe(4 * 2)
    for (const e of friction) {
      expect(model.materials.get(Number((e.args.mat as number[])[0]))!.matType).toBe('ENT') // a flat slider carries no tension
      const f = e.args.friction as Record<string, number>
      expect(f).toMatchObject({ normalDir: 2, shearDir: 1, mu: 5, b: 0 })
      expect(f.k0 / (1000 * KIP / IN)).toBeCloseTo(1, 9)
    }
    const parallel = elements(model, 'zeroLength', (a) => Array.isArray(a.mat) && model.materials.get(Number(a.mat[0]))?.matType === 'Parallel')
    expect(parallel.length).toBe(4 * 2)
    const x = parallel.map((e) => Number((model.nodes.get(e.nodes[1])!.coords[0] % 3.048).toFixed(4))).sort((a, b) => a - b)
    expect(x).toEqual([0.3048, 0.3048, 0.3048, 0.3048, 2.7432, 2.7432, 2.7432, 2.7432])
    // The outer dowels of the end panels are the two #9 bars (536 kN); the interior ones the two #4 (105 kN).
    const dowelYield = (e: { args: Record<string, unknown> }) => {
      const parallelMat = model.materials.get(Number((e.args.mat as number[])[0]))!
      return Number(model.materials.get(Number((parallelMat.args.matTags as number[])[1]))!.args.fy)
    }
    const byPanel = (panel: number) => parallel.filter((e) => Math.floor(model.nodes.get(e.nodes[1])!.coords[0] / 3.048) === panel).map(dowelYield).sort((a, b) => a - b)
    expect(byPanel(0)).toEqual([105e3, 536e3])
    expect(byPanel(1)).toEqual([105e3, 105e3])
    expect(byPanel(3)).toEqual([105e3, 536e3])
  })

  it('has a weak elastic-perfectly-plastic shear spring at each panel\'s base centerline', () => {
    const { model } = build()
    const stabilizers = elements(model, 'zeroLength', (a) => model.materials.get(Number((a.mat as number[])?.[0]))?.matType === 'ElasticPP')
    expect(stabilizers.length).toBe(4)
    const args = model.materials.get(Number((stabilizers[0].args.mat as number[])[0]))!.args
    expect(Number(args.e) / (30 * KIP / IN)).toBeCloseTo(1, 9)
    expect(args.epsyP).toBeCloseTo(IN, 12)
  })

  it('smears the sections by segment: a concrete and a steel fiber each, 14 segments, the splice with 0.25% more steel', () => {
    const { model } = build()
    const [wall, splice] = [...model.sections.values()]
    expect(wall.children.length).toBe(28)
    const steel = (s: typeof wall) => s.children.filter((c) => model.materials.get(Number(c.args.matTag))!.matType === 'MinMax').reduce((a, c) => a + Number(c.args.A), 0)
    const gross = 10 * FT * 8 * IN
    expect(steel(wall) / gross).toBeCloseTo(0.2 * 0.015 * 2 + 0.6 * 0.0025, 6)
    expect(steel(splice) / gross).toBeCloseTo(0.2 * 0.015 * 2 + 0.6 * 0.0025 + 0.0025, 6)
  })

  it('loads gravity as self-weight plus a 0.5% roof axial load, and the floors only as mass', () => {
    const { model } = build()
    const total = [...model.patterns.get(1)!.children].reduce((a, c) => a + Number((c.args.values as number[])[1]), 0)
    const self = 150 * 157.0875 * 8 * IN * 10 * FT * 38 * FT * 4
    const axial = 0.005 * 10 * FT * 8 * IN * 6000 * 6894.757 * 4
    expect(-total / (self + axial)).toBeCloseTo(1, 9)
    const mass = [...model.masses.values()].reduce((a, m) => a + m.values[0], 0)
    expect(mass * 9.80665 / (self + axial + 3 * 670 * KIP)).toBeCloseTo(1, 9)
    for (const m of model.masses.values()) expect(m.values.slice(1)).toEqual([0, 0])
  })

  it('pushes with an inverted triangle, 17, 33 and 50%, at 14, 26 and 38 ft, shared by the panels', () => {
    const { model, t } = build()
    const loads = model.patterns.get(2)!.children
    expect(loads.length).toBe(4 * 3)
    const byHeight = new Map<string, number>()
    for (const c of loads) { const y = (model.nodes.get(Number(c.args.nodeTag))!.coords[1] / FT).toFixed(1); byHeight.set(y, (byHeight.get(y) ?? 0) + Number((c.args.values as number[])[0])) }
    expect(Object.fromEntries([...byHeight].map(([y, f]) => [y, Number((f / KIP).toFixed(2))]))).toEqual({ '13.6': 0.17, '27.1': 0.33, '38.0': 0.5 })
    expect(t.levels!.map((l) => Number((l.height / FT).toFixed(1)))).toEqual([14, 26, 38])
  })

  it('compiles to Carapace with no diagnostics', () => {
    for (const friction of [true, false]) {
      const { model, history } = build({ friction })
      expect(compileInputV1(model, history).diagnostics).toEqual([])
    }
  })
})

describe('precast wall template: structure follows the parameters', () => {
  it('counts panels, connectors and bearings from the parameters', () => {
    const { model } = build({ panels: 3, connectorsPerJoint: 5 })
    expect(elements(model, 'DispBeamColumn').length).toBe(3 * 7) // 8 nodes per panel: the base, the splice top, 5 connectors and the roof
    expect(elements(model, 'zeroLength', isConnector).length).toBe(2 * 5)
    expect(elements(model, 'zeroLength', (a) => a.friction !== undefined).length).toBe(3 * 2)
  })

  it('carries the connector properties into the materials', () => {
    const { model } = build({ Kv: 7e7, Fy: 1.5e5, b: 0.02, Ka: 3e9 })
    const connector = elements(model, 'zeroLength', isConnector)[0]
    const [axial, shear] = (connector.args.mat as number[]).map((id) => model.materials.get(id)!)
    expect(axial.args.e).toBe(3e9)
    expect(shear.args).toMatchObject({ fy: 1.5e5, e0: 7e7, b: 0.02 })
  })

  it('stands every foundation node fixed, at the base, and nothing else', () => {
    const { model } = build({ panels: 2 })
    const fixed = [...model.fixes.values()].map((f) => f.nodeId)
    for (const id of fixed) expect(model.nodes.get(id)!.coords[1]).toBe(0)
    expect(fixed.length).toBe(2 * (11 + 1)) // 11 bearings and the stabilizer, per panel
  })

  it('takes any number of stories and any heights', () => {
    const { model } = build({ panels: 2, panelHeight: 22, storyHeights: [3, 3.5, 3.5, 4, 4, 4], lateralWeights: [] })
    expect(new Set([...model.patterns.get(2)!.children].map((c) => model.nodes.get(Number(c.args.nodeTag))!.coords[1].toFixed(3))).size).toBe(6)
  })
})

describe('precast wall template: behaviour', () => {
  const small = { panels: 2, panelHeight: 6, connectorsPerJoint: 3, bearingSpacing: 0.6, storyHeights: [3, 3], lateralWeights: [0.4, 0.6], spliceHeight: 0.6 }
  const pushover = (p: Partial<PrecastWallParams>, steps?: number) => {
    const { t, model, history } = build(p)
    const commands = steps ? history.commands.map((c) => (c.type === 'ANALYSIS_BLOCK' && c.blockId === 'run-pushover-analysis' ? { ...c, params: { ...c.params, steps } } : c)) : history.commands
    const run = runCarapace(model, { commands: commands as never, cursor: commands.length - 1 })
    expect(run.error).toBeNull()
    const last = t.analysisCommands.at(-1)
    const roof = Number(last && last.type === 'ANALYSIS_BLOCK' ? last.params.nodeTag : 0)
    const plans = run.compile.recorderPlans
    const ux = run.columns[plans.find((x) => x.kind === 'disp' && x.targetTag === roof)!.columnOffset]
    const shear = run.times.map((_, k) => -plans.filter((x) => x.kind === 'reaction').reduce((a, x) => a + run.columns[x.columnOffset][k], 0))
    const at = (inches: number) => { const k = ux.findIndex((v, i) => i > 9 && v / IN >= inches); return shear[k] / KIP }
    return { ux, shear, at }
  }

  it('reproduces the study\'s OpenSees pushover (the Kv = 300 kip/in baseline) within 2%', () => {
    // Base shear against roof displacement from `time_history_comparison_studies()[1]` run through OpenSeesPyTools' `run_pushover`: flat-slider
    // bases and Aggregator shear sections, which Carapace's fiber sections do not have. Roof displacement in inches, base shear in kip.
    const study: [number, number][] = [[0.290, 274], [0.507, 361], [1.008, 437], [2.011, 512], [2.878, 570], [4.018, 604]]
    const { at, ux } = pushover({})
    expect(Math.max(...ux) / IN).toBeGreaterThan(4.4) // reaches 1% drift, 4.56 in
    for (const [roof, kip] of study) {
      expect(at(roof) / kip, `${roof} in`).toBeGreaterThan(0.98)
      expect(at(roof) / kip, `${roof} in`).toBeLessThan(1.02)
    }
  })

  it('is stiffer with stiffer vertical connectors', () => {
    const soft = pushover({ ...small, Kv: 1e6 }, 100), stiff = pushover({ ...small, Kv: 1e9 }, 100)
    expect(stiff.shear[40] / stiff.ux[40]).toBeGreaterThan(1.3 * soft.shear[40] / soft.ux[40])
  })

  it('slides at the friction limit, and carries more shear when friction holds', () => {
    const grip = pushover({ ...small, mu: 5 }, 100), loose = pushover({ ...small, mu: 0.05 }, 100)
    expect(grip.shear.at(-1)!).toBeGreaterThan(2 * loose.shear.at(-1)!)
  })
})
