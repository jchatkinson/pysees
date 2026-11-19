import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { LevelEntity } from '@/app/types/levels'
import type { TemplateResult } from '@/app/lib/templates'

/**
 * A multi-panel precast concrete shear wall, built to the configuration of the four-panel benchmark of "Influence of Vertical Connection
 * Stiffness and Deformation Capacity on the Seismic Performance of Intermediate Precast Concrete Shear Walls" (PCI Journal), as set up in
 * OpenSeesPyTools' `utils/precast` (`time_history_comparison_studies()`, the Kv = 300 kip/in "Baseline"). 2D, in the plane of the wall; SI (N, m, Pa).
 *
 * - Each panel is a column of `DispBeamColumn` fiber elements (Lobatto, 2 points) on its centerline, with nodes at the base, the top of the splice
 *   region, every vertical-joint connector elevation and the roof. Two fiber sections: the wall, and the splice (more steel, from the dowels).
 *   Concrete and steel are smeared by segment: two segments across each boundary zone and ten across the web, each a concrete fiber and a steel
 *   fiber placed 1 inch off its centre.
 * - Rigid elastic arms run from the centerline to the panel edges at the base and at every connector elevation.
 * - Every vertical joint has `connectorsPerJoint` zero-length connectors at H·i/(n+1), joining the facing edge nodes: Steel02 shear (`Kv`, `Fy`, `b`),
 *   elastic axial (`Ka`).
 * - Each panel stands on a rigid base beam with a bearing every `bearingSpacing` (ENT, stiffness per length `Kc`). At the two panel edges the bearing is
 *   compression-only too, with Coulomb friction (`mu`, stick stiffness `Ks`); the dowels, a Steel02 force-deformation spring in parallel with the
 *   bearing, sit `dowelOffset` from each edge. A weak elastic-perfectly-plastic shear spring at the centerline keeps the base solvable.
 * - Gravity is the panels' self-weight plus an axial load at each roof of `axialLoadRatio × Ag × f'c`. The floor weights are mass only, as in the
 *   study. The pushover is an inverted-triangle lateral pattern (`lateralWeights` at the floors) under displacement control at the first panel's roof.
 *
 * Friction is a Carapace feature that OpenSees' zeroLength cannot represent, so an exported script carries it without friction, with a warning
 * comment. Set `friction: false` for a model that runs identically in both; the edge bearings then carry shear through an elastic spring.
 * One thing the study has that this does not: its panel sections aggregate an elastic shear response (OpenSees `Aggregator`), which Carapace's fiber
 * sections do not have, so shear deformation of the panels is not modelled.
 */
export interface PrecastWallParams {
  /** Number of panels side by side, each `panelWidth` wide, `panelHeight` tall and `thickness` thick (m). */
  panels: number
  panelWidth: number
  panelHeight: number
  thickness: number
  /** Height of the splice region at the base (m). */
  spliceHeight: number
  /** Vertical-joint connectors per joint, at H·i/(n+1); shear stiffness (N/m), yield force (N), post-yield ratio; elastic axial stiffness (N/m). */
  connectorsPerJoint: number
  Kv: number
  Fy: number
  b: number
  Ka: number
  /** Story heights from the foundation up (m), one floor at the top of each. The lateral load and the floor mass go to the panel node nearest it. */
  storyHeights: number[]
  /** Share of the lateral load at each floor (sums to 1), and the seismic weight of each floor (N, whole wall), which is mass only. */
  lateralWeights: number[]
  floorWeight: number
  /** Gravity: the unit weight of concrete (N/m³) and the roof axial load as a fraction of Ag f'c. */
  unitWeight: number
  axialLoadRatio: number
  /** Bearing spacing (m) and stiffness per unit length of base (Pa), which a bearing multiplies by its tributary length. */
  bearingSpacing: number
  Kc: number
  /** Base shear at the two panel-edge bearings: friction coefficient and stick stiffness (N/m), or an elastic spring of that stiffness when `friction` is false. */
  friction: boolean
  mu: number
  Ks: number
  /** Stabilizing shear spring at each panel's base centerline: stiffness (N/m) and yield displacement (m). */
  stabilizerK: number
  stabilizerYield: number
  /** Concrete f'c (Pa), ultimate strain, steel yield and modulus (Pa), steel hardening ratio, steel strain limit. */
  fc: number
  epsU: number
  fy: number
  Es: number
  steelB: number
  steelStrainLimit: number
  /** Reinforcement ratios: web, extra in the splice region, boundary zone; boundary zone length as a share of the panel width. */
  wallRho: number
  spliceRho: number
  boundaryRho: number
  boundaryRatio: number
  /** Base dowels, `dowelOffset` from each panel edge: the two bars at an end of the assembly, and at an interior edge. Yield force (N), stiffness (N/m), hardening. */
  dowelOffset: number
  dowelEnd: { Fy: number; K: number; b: number }
  dowelJoint: { Fy: number; K: number; b: number }
}

const IN = 0.0254, FT = 0.3048, KIP = 4448.2216, KSI = 6.894757e6, PSI = 6894.757, PCF = 157.0875, KIP_PER_IN = KIP / IN

/** The paper's benchmark (10 ft × 38 ft × 8 in panels, floors at 14, 26 and 38 ft, 13 connectors per joint at 300 kip/in and 44 kip, 6 ksi concrete, 60 ksi steel), in SI. */
export const PRECAST_WALL_DEFAULTS: PrecastWallParams = {
  panels: 4,
  panelWidth: 10 * FT,
  panelHeight: 38 * FT,
  thickness: 8 * IN,
  spliceHeight: 5 * FT,
  connectorsPerJoint: 13,
  Kv: 300 * KIP_PER_IN,
  Fy: 44 * KIP,
  b: 0.001,
  Ka: 48000 * KIP_PER_IN,
  storyHeights: [14 * FT, 12 * FT, 12 * FT],
  lateralWeights: [0.17, 0.33, 0.5],
  floorWeight: 670 * KIP,
  unitWeight: 150 * PCF,
  axialLoadRatio: 0.005,
  bearingSpacing: 12 * IN,
  Kc: 4000 * KSI,
  friction: true,
  mu: 5,
  Ks: 1000 * KIP_PER_IN,
  stabilizerK: 30 * KIP_PER_IN,
  stabilizerYield: 1 * IN,
  fc: 6000 * PSI,
  epsU: -0.008,
  fy: 60 * KSI,
  Es: 29000 * KSI,
  steelB: 0.01,
  steelStrainLimit: 0.05,
  wallRho: 0.0025,
  spliceRho: 0.0025,
  boundaryRho: 0.015,
  boundaryRatio: 0.2,
  dowelOffset: 12 * IN,
  dowelEnd: { Fy: 2 * 268e3, K: 2 * 304e6, b: 0.01 },
  dowelJoint: { Fy: 105e3, K: 224e6, b: 0.01 },
}

const RIGID = { A: 1000 * IN * IN, E: 29000 * KSI, Iz: 1e8 * IN ** 4 }
const INTEGRATION_POINTS = 2
const STEEL_OFFSET = 1 * IN // each steel fiber sits this far from its concrete fiber, away from the section centre
const WEB_SEGMENTS = 10
const BOUNDARY_SEGMENTS = 2
const GRAVITY = 9.80665
const PUSHOVER_STEPS = 200
const PUSHOVER_DRIFT = 0.01
const TOL = 1e-9
const LATERAL_TOTAL = 1 * KIP // the size of the lateral pattern only sets its direction for displacement control

export function precastWallTemplate(input: Partial<PrecastWallParams> = {}): TemplateResult {
  const p: PrecastWallParams = { ...PRECAST_WALL_DEFAULTS, ...input }
  const { panels, panelWidth: W, panelHeight: H, thickness: t } = p
  const Ec = 4500 * Math.sqrt(p.fc / 1e6) * 1e6
  const writes: ModelWrite[] = []

  // --- ids ---
  let nodeId = 0, eleId = 0
  const addNode = (x: number, y: number) => { writes.push({ kind: 'node', entity: { id: ++nodeId, coords: [x, y] } }); return nodeId }
  const addFoundationNode = (x: number, y: number) => { const id = addNode(x, y); writes.push({ kind: 'fix', entity: { nodeId: id, dofs: [1, 2, 3] } }); return id }

  // --- materials, created on first use so equal ones are shared ---
  let matId = 0
  const cache = new Map<string, number>()
  const uniaxial = (matType: string, args: Record<string, unknown>, usage?: 'force-deformation'): number => {
    const key = JSON.stringify([matType, args, usage])
    let id = cache.get(key)
    if (id === undefined) {
      id = ++matId
      cache.set(key, id)
      writes.push({ kind: 'material', entity: { id, kind: 'uniaxial', matType, args: { matTag: id, matType, ...args }, ...(usage ? { usage } : {}) } })
    }
    return id
  }
  const steel02 = (fy: number, e0: number, b: number) => ({ fy, e0, b, r0: 15, cr1: 0.925, cr2: 0.15, a1: 0, a2: 1, a3: 0, a4: 1 })
  const ft = 0.3 * Math.sqrt(p.fc / 1e6) * 1e6
  const concrete = uniaxial('Concrete02', { fpc: -p.fc, epsc0: -2 * p.fc / Ec, fpcu: -0.05 * p.fc, epsU: p.epsU, lambda: 0.1, ft, ets: 0.025 * Ec })
  const rebar = uniaxial('MinMax', { otherTag: uniaxial('Steel02', steel02(p.fy, p.Es, p.steelB)), minStrain: -p.steelStrainLimit, maxStrain: p.steelStrainLimit })
  const connectorAxial = uniaxial('Elastic', { e: p.Ka }, 'force-deformation')
  const connectorShear = uniaxial('Steel02', steel02(p.Fy, p.Kv, p.b), 'force-deformation')
  const dowelMaterial = (d: { Fy: number; K: number; b: number }) => uniaxial('Steel02', steel02(d.Fy, d.K, d.b), 'force-deformation')

  // --- panel sections: the wall and the splice region (the dowels add steel there) ---
  writes.push({ kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } })
  const boundary = p.boundaryRatio * W
  const segments: { y0: number; y1: number; boundary: boolean }[] = []
  const split = (y0: number, y1: number, count: number, isBoundary: boolean) => { for (let i = 0; i < count; i++) segments.push({ y0: y0 + (y1 - y0) * i / count, y1: y0 + (y1 - y0) * (i + 1) / count, boundary: isBoundary }) }
  split(-W / 2, -W / 2 + boundary, BOUNDARY_SEGMENTS, true)
  split(-W / 2 + boundary, W / 2 - boundary, WEB_SEGMENTS, false)
  split(W / 2 - boundary, W / 2, BOUNDARY_SEGMENTS, true)
  let nextSection = 0
  const fiberSection = (extraRho: number) => {
    const id = ++nextSection
    const children = segments.flatMap(({ y0, y1, boundary: isBoundary }) => {
      const yc = (y0 + y1) / 2, gross = t * (y1 - y0), rho = (isBoundary ? p.boundaryRho : p.wallRho) + extraRho
      const ySteel = yc + (yc >= 0 ? STEEL_OFFSET : -STEEL_OFFSET)
      return [
        { kind: 'fiber' as const, subType: 'fiber', args: { yloc: yc, zloc: 0, A: (1 - rho) * gross, matTag: concrete } },
        { kind: 'fiber' as const, subType: 'fiber', args: { yloc: ySteel, zloc: 0, A: rho * gross, matTag: rebar } },
      ]
    })
    writes.push(
      { kind: 'section', entity: { id, secType: 'Fiber', args: { secTag: id, type: 'Fiber' }, children } },
      { kind: 'beamIntegration', entity: { id, intType: 'Lobatto', args: { type: 'Lobatto', tag: id, secTag: id, n: INTEGRATION_POINTS } } },
    )
    return id
  }
  const wallIntegration = fiberSection(0), spliceIntegration = fiberSection(p.spliceRho)

  // --- elevations: base, the top of the splice, every connector, the roof ---
  const connectorLevels = Array.from({ length: p.connectorsPerJoint }, (_, i) => Number((H * (i + 1) / (p.connectorsPerJoint + 1)).toFixed(9)))
  const levels = [...new Set([0, Number(p.spliceHeight.toFixed(9)), ...connectorLevels, Number(H.toFixed(9))])].sort((a, b) => a - b)
  const armLevels = [0, ...connectorLevels]
  const rigid = (a: number, b: number) => writes.push({ kind: 'element', entity: { id: ++eleId, eleType: 'ElasticBeamColumn', nodes: [a, b], args: { ...RIGID, transfTag: 1 } } })
  const zeroLength = (a: number, b: number, args: Record<string, unknown>) => writes.push({ kind: 'element', entity: { id: ++eleId, eleType: 'zeroLength', nodes: [a, b], args } })

  // --- base bearing layout: a bearing grid merged with the dowel positions ---
  const segmentsAcross = Math.max(1, Math.floor(W / p.bearingSpacing + 1e-6))
  const dowelAt = [p.dowelOffset, W - p.dowelOffset]
  const positions = [...new Set([...Array.from({ length: segmentsAcross + 1 }, (_, i) => W * i / segmentsAcross), ...dowelAt].map((x) => Number(x.toFixed(6))))].sort((a, b) => a - b)
  const tributary = positions.map((x, i) => (i === 0 ? positions[1] - x : i === positions.length - 1 ? x - positions[i - 1] : positions[i + 1] - positions[i - 1]) / 2)

  // --- panels ---
  const column: Map<number, number>[] = [] // centerline node id by elevation, per panel
  const leftEdge: Map<number, number>[] = []
  const rightEdge: Map<number, number>[] = []
  for (let panel = 0; panel < panels; panel++) {
    const xl = panel * W, xc = xl + W / 2, xr = xl + W
    const nodes = new Map(levels.map((y) => [y, addNode(xc, y)] as const))
    column.push(nodes)
    leftEdge.push(new Map())
    rightEdge.push(new Map())
    for (let k = 0; k < levels.length - 1; k++) {
      const integration = levels[k + 1] <= p.spliceHeight + TOL ? spliceIntegration : wallIntegration
      writes.push({ kind: 'element', entity: { id: ++eleId, eleType: 'DispBeamColumn', nodes: [nodes.get(levels[k])!, nodes.get(levels[k + 1])!], args: { transfTag: 1, integrationTag: integration } } })
    }
    for (const y of armLevels) {
      const left = addNode(xl, y), right = addNode(xr, y)
      leftEdge[panel].set(y, left)
      rightEdge[panel].set(y, right)
      rigid(left, nodes.get(y)!)
      rigid(nodes.get(y)!, right)
    }

    // Base: a rigid beam through every bearing position (its ends are the edge nodes at the base), each position on a coincident fixed node.
    const base = nodes.get(0)!
    const beamNodes = positions.map((x, i) => (i === 0 ? leftEdge[panel].get(0)! : i === positions.length - 1 ? rightEdge[panel].get(0)! : addNode(xl + x, 0)))
    for (let i = 0; i < beamNodes.length - 1; i++) rigid(beamNodes[i], beamNodes[i + 1])
    const dowelKeys = [panel === 0 ? p.dowelEnd : p.dowelJoint, panel === panels - 1 ? p.dowelEnd : p.dowelJoint]
    positions.forEach((x, i) => {
      const stiffness = p.Kc * tributary[i]
      const atEdge = i === 0 || i === positions.length - 1
      const ground = addFoundationNode(xl + x, 0)
      if (atEdge) {
        // The friction bearing. OpenSees' flat slider carries no tension whatever axial material it is given (the study gives it an elastic one), so
        // the edge bearing is compression-only: ENT, with friction (Carapace) or an elastic shear spring.
        const axial = uniaxial('ENT', { e: stiffness }, 'force-deformation')
        zeroLength(ground, beamNodes[i], p.friction
          ? { mat: [axial], dir: [2], friction: { normalDir: 2, shearDir: 1, mu: p.mu, k0: p.Ks, b: 0 } }
          : { mat: [axial, uniaxial('Elastic', { e: p.Ks }, 'force-deformation')], dir: [2, 1] })
        return
      }
      const bearing = uniaxial('ENT', { e: stiffness }, 'force-deformation')
      const dowel = dowelAt.findIndex((d) => Math.abs(d - x) < 1e-6)
      zeroLength(ground, beamNodes[i], { mat: [dowel < 0 ? bearing : uniaxial('Parallel', { matTags: [bearing, dowelMaterial(dowelKeys[dowel])], factorArgs: [1, 1] }, 'force-deformation')], dir: [2] })
    })
    // A weak shear spring at the centerline: elastic-perfectly-plastic, so it stabilises a sliding base without carrying much.
    zeroLength(addFoundationNode(xc, 0), base, { mat: [uniaxial('ElasticPP', { e: p.stabilizerK, epsyP: p.stabilizerYield }, 'force-deformation')], dir: [1] })
  }

  // --- vertical connectors: zero-length Steel02 shear + elastic axial between the facing edge nodes ---
  for (const y of connectorLevels) {
    for (let joint = 0; joint < panels - 1; joint++) zeroLength(rightEdge[joint].get(y)!, leftEdge[joint + 1].get(y)!, { mat: [connectorAxial, connectorShear], dir: [1, 2] })
  }

  // --- gravity: self-weight at every centerline node (tributary height), plus the roof axial load; mass at the same nodes along x ---
  const nearest = (target: number) => levels.reduce((best, y) => (Math.abs(y - target) < Math.abs(best - target) ? y : best), levels[0])
  const floorHeights = p.storyHeights.map((_, i) => p.storyHeights.slice(0, i + 1).reduce((a, b) => a + b, 0))
  const weights = p.lateralWeights.length === floorHeights.length ? p.lateralWeights : floorHeights.map((h) => h / floorHeights.reduce((a, b) => a + b, 0))
  const gravity = new Map<number, number>() // node -> downward force (N)
  const mass = new Map<number, number>() // node -> mass along x (kg)
  const add = (map: Map<number, number>, node: number, v: number) => map.set(node, (map.get(node) ?? 0) + v)
  for (let panel = 0; panel < panels; panel++) {
    levels.forEach((y, k) => {
      const tributaryHeight = ((k > 0 ? y - levels[k - 1] : 0) + (k < levels.length - 1 ? levels[k + 1] - y : 0)) / 2
      const weight = p.unitWeight * t * W * tributaryHeight
      add(gravity, column[panel].get(y)!, weight)
      add(mass, column[panel].get(y)!, weight / GRAVITY)
    })
    const roofNode = column[panel].get(levels[levels.length - 1])!
    const axial = p.axialLoadRatio * W * t * p.fc
    add(gravity, roofNode, axial)
    add(mass, roofNode, axial / GRAVITY)
    for (const h of floorHeights) add(mass, column[panel].get(nearest(h))!, p.floorWeight / GRAVITY / panels)
  }
  for (const [node, kg] of mass) writes.push({ kind: 'mass', entity: { nodeId: node, values: [kg, 0, 0] } })
  writes.push(
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, name: 'Gravity', patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    ...[...gravity].map(([node, f]): ModelWrite => ({ kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: node, values: [0, -f, 0] } } })),
    { kind: 'timeSeries', entity: { id: 2, tsType: 'Linear', args: { type: 'Linear', tag: 2, factor: 1 } } },
    { kind: 'pattern', entity: { id: 2, name: 'Lateral', patternType: 'Plain', args: { type: 'Plain', patternTag: 2, tsTag: 2, fact: 1 }, children: [] } },
  )
  // An inverted-triangle pattern at the floors, shared equally by the panels.
  floorHeights.forEach((h, i) => {
    for (let panel = 0; panel < panels; panel++) writes.push({ kind: 'patternChild', patternId: 2, child: { kind: 'load', args: { nodeTag: column[panel].get(nearest(h))!, values: [LATERAL_TOTAL * weights[i] / panels, 0, 0] } } })
  })

  const roof = column[0].get(levels[levels.length - 1])!
  const analysisCommands: AnalysisCommand[] = [
    { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-eigen-analysis', params: { modes: Math.max(1, Math.min(3, panels * floorHeights.length)) } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 10 } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns: [2], nodeTag: roof, dof: 1, increment: PUSHOVER_DRIFT * H / PUSHOVER_STEPS, steps: PUSHOVER_STEPS, algorithm: 'NewtonLineSearch', maxIter: 50 } },
  ]
  const storyLevels: LevelEntity[] = floorHeights.map((height, i) => ({ id: i + 1, label: `Floor ${i + 1}`, height }))
  return { ndm: 2, ndf: 3, writes, analysisCommands, levels: storyLevels }
}
