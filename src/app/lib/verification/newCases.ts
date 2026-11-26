import { modelFromWrites } from '@/app/lib/commands/testkit'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { FRAME_GROUND_MOTION, cantileverTemplate, frame3dTemplate, frameTemplate, plateTemplate } from '@/app/lib/templates'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { CaseModel, Signal, VerificationCase } from './types'
import { SRC, baseShear, disp, pushoverCurve } from './helpers'

// ---------------------------------------------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------------------------------------------

const node = (id: number, coords: number[]): ModelWrite => ({ kind: 'node', entity: { id, coords } })
const fix = (nodeId: number, dofs: number[]): ModelWrite => ({ kind: 'fix', entity: { nodeId, dofs } })
const transf = (id: number, type: 'Linear' | 'PDelta' | 'Corotational', vecxz?: number[]): ModelWrite => ({ kind: 'geomTransf', entity: { id, transfType: type, args: { type, transfTag: id, ...(vecxz ? { vecxz } : {}) } } })
const elastic2 = (id: number, nodes: number[], A: number, E: number, Iz: number, transfTag: number): ModelWrite => ({ kind: 'element', entity: { id, eleType: 'ElasticBeamColumn', nodes, args: { A, E, Iz, transfTag } } })
const elastic3 = (id: number, nodes: number[], p: { A: number; E: number; G: number; J: number; Iy: number; Iz: number }, transfTag: number): ModelWrite => ({ kind: 'element', entity: { id, eleType: 'ElasticBeamColumn', nodes, args: { ...p, transfTag } } })
const fiberEle = (id: number, nodes: number[], transfTag: number, integrationTag: number): ModelWrite => ({ kind: 'element', entity: { id, eleType: 'DispBeamColumn', nodes, args: { transfTag, integrationTag } } })
const mat = (id: number, matType: string, args: Record<string, unknown>): ModelWrite => ({ kind: 'material', entity: { id, kind: 'uniaxial', matType, args: { matTag: id, matType, ...args } } })
const series = (id: number): ModelWrite => ({ kind: 'timeSeries', entity: { id, tsType: 'Linear', args: { type: 'Linear', tag: id, factor: 1 } } })
const pattern = (id: number, loads: [number, number[]][], tsTag = id): ModelWrite[] => [
  ...(tsTag === id ? [series(id)] : []),
  { kind: 'pattern', entity: { id, patternType: 'Plain', args: { type: 'Plain', patternTag: id, tsTag, fact: 1 }, children: [] } },
  ...loads.map(([nodeTag, values]): ModelWrite => ({ kind: 'patternChild', patternId: id, child: { kind: 'load', args: { nodeTag, values } } })),
]
const recorder = (dynamic = false): AnalysisCommand => ({ type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out', ...(dynamic ? { dynamic: 'Yes' } : {}) } })
const gravity = (patterns: number[], steps: number, extra: Record<string, unknown> = {}): AnalysisCommand => ({ type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns, steps, holdLoads: 'Yes', ...extra } })
const push = (patterns: number[], nodeTag: number, dof: number, increment: number, steps: number, extra: Record<string, unknown> = {}): AnalysisCommand => ({ type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns, nodeTag, dof, increment, steps, ...extra } })
const history = (commands: AnalysisCommand[]) => ({ commands, cursor: commands.length - 1 })
/** Fiber members' forces depend on where Newton stops; both engines iterate to a tight tolerance so the comparison measures the engines. */
const TIGHT = { testType: 'NormDispIncr', tol: 1e-10, maxIter: 100 }
const modelFromWritesOnto = applyModelWrite
const neg = (s: Signal): Signal => ({ sum: [s], scale: -1 })

/** A rectangular concrete fiber section, `b` × `h` (local z × y), with a bar of area `bar` at each corner (cover `c`); `-GJ` for 3D. */
function rcSection(id: number, concrete: number, steel: number, b: number, h: number, bar: number, c: number, gJ?: number): ModelWrite {
  const [y, z] = [h / 2 - c, b / 2 - c]
  return { kind: 'section', entity: { id, secType: 'Fiber', args: { type: 'Fiber', secTag: id, ...(gJ ? { gJ } : {}) }, children: [
    { kind: 'patch', subType: 'rect', args: { matTag: concrete, numSubdivY: 10, numSubdivZ: 6, y1: -h / 2, z1: -b / 2, y2: h / 2, z2: b / 2 } },
    ...[[-y, -z], [-y, z], [y, -z], [y, z]].map(([yloc, zloc]) => ({ kind: 'fiber' as const, subType: 'fiber', args: { yloc, zloc, A: bar, matTag: steel } })),
  ] } }
}
const concrete01 = (id: number) => mat(id, 'Concrete01', { fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006 })
const steel01 = (id: number) => mat(id, 'Steel01', { fy: 400e6, e0: 200e9, b: 0.01 })
const integration = (id: number, secTag: number, type: 'Legendre' | 'Lobatto', n: number): ModelWrite => ({ kind: 'beamIntegration', entity: { id, intType: type, args: { type, tag: id, secTag, n } } })

/** `n` elements from `a` to `b` (node ids from `firstNode`, element ids from `firstEle`), with `offset(t)` added to each interior node. */
function line(a: number[], b: number[], n: number, firstNode: number, firstEle: number, ele: (id: number, nodes: number[]) => ModelWrite, offset?: (t: number) => number[]): ModelWrite[] {
  const out: ModelWrite[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = offset?.(t) ?? a.map(() => 0)
    out.push(node(firstNode + i, a.map((v, k) => v + (b[k] - v) * t + o[k])))
  }
  for (let i = 0; i < n; i++) out.push(ele(firstEle + i, [firstNode + i, firstNode + i + 1]))
  return out
}

/** Complete elliptic integral of the first kind, K(k), by the arithmetic-geometric mean. */
function ellipticK(k: number) {
  let a = 1, g = Math.sqrt(1 - k * k)
  for (let i = 0; i < 30; i++) [a, g] = [(a + g) / 2, Math.sqrt(a * g)]
  return Math.PI / (2 * a)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Geometric nonlinearity
// ---------------------------------------------------------------------------------------------------------------------------------

/** EI = 1, L = 1 members: E = 1e4, Iz = 1e-4, nearly inextensible (EA = 1e6). */
const UNIT = { A: 100, E: 1e4, Iz: 1e-4 }

/** A cantilever column under axial load P, pushed sideways at the top: lateral stiffness 3EI/L³ − P/L with P-Delta. */
function pdeltaCantilever(): CaseModel {
  const L = 3, E = 200e9, I = 1e-4, P = 1e6
  return {
    model: modelFromWrites(2, 3, [
      node(1, [0, 0]), node(2, [0, L]), fix(1, [1, 2, 3]), transf(1, 'PDelta'), elastic2(1, [1, 2], 0.01, E, I, 1),
      ...pattern(1, [[2, [0, -P, 0]]]), ...pattern(2, [[2, [1, 0, 0]]]),
    ]),
    history: history([recorder(), gravity([1], 5), push([2], 2, 1, 0.002, 25)]),
  }
}

/** An elastic portal frame under heavy gravity load, pushed sideways with P-Delta columns and a linear beam. */
function pdeltaPortal(): CaseModel {
  const h = 3.5, L = 6, E = 200e9
  return {
    model: modelFromWrites(2, 3, [
      node(1, [0, 0]), node(2, [L, 0]), node(3, [0, h]), node(4, [L, h]), node(5, [0, h / 2]), node(6, [L, h / 2]), fix(1, [1, 2, 3]), fix(2, [1, 2, 3]),
      transf(1, 'PDelta'), transf(2, 'Linear'),
      elastic2(1, [1, 5], 0.01, E, 1e-4, 1), elastic2(2, [5, 3], 0.01, E, 1e-4, 1), elastic2(3, [2, 6], 0.01, E, 1e-4, 1), elastic2(4, [6, 4], 0.01, E, 1e-4, 1), elastic2(5, [3, 4], 0.01, E, 2e-4, 2),
      ...pattern(1, [[3, [0, -1.5e6, 0]], [4, [0, -1.5e6, 0]]]), ...pattern(2, [[3, [1, 0, 0]]]),
    ]),
    history: history([recorder(), gravity([1], 10), push([2], 3, 1, 0.002, 50)]),
  }
}

/** The elastica: a cantilever (EI = 1, L = 1, 10 corotational elements) under a growing tip load perpendicular to it. */
function corotCantilever(): CaseModel {
  return {
    model: modelFromWrites(2, 3, [
      ...line([0, 0], [1, 0], 10, 1, 1, (id, n) => elastic2(id, n, UNIT.A, UNIT.E, UNIT.Iz, 1)), fix(1, [1, 2, 3]), transf(1, 'Corotational'),
      ...pattern(1, [[11, [0, -10, 0]]]),
    ]),
    history: history([recorder(), gravity([1], 50, { holdLoads: 'No' })]),
  }
}
/** Mattiasson (1981), Table 1: tip deflections of the elastica under a perpendicular tip load, PL²/EI = 1…10. */
const ELASTICA: [number, number, number][] = [[1, 0.05643, 0.30172], [2, 0.16064, 0.49346], [3, 0.25442, 0.60325], [4, 0.32894, 0.66996], [5, 0.38763, 0.71379], [6, 0.43459, 0.74457], [7, 0.47293, 0.76737], [8, 0.50483, 0.78498], [9, 0.53182, 0.79906], [10, 0.555, 0.81061]]

/** A pinned column (EI = 1, L = 1) with a L/1000 sine imperfection, driven past the Euler load by its mid-height sway (corotational). */
function corotEuler(): CaseModel {
  const n = 10
  return {
    model: modelFromWrites(2, 3, [
      ...line([0, 0], [0, 1], n, 1, 1, (id, nodes) => elastic2(id, nodes, UNIT.A, UNIT.E, UNIT.Iz, 1), (t) => [1e-3 * Math.sin(Math.PI * t), 0]), fix(1, [1, 2]), fix(n + 1, [1]), transf(1, 'Corotational'),
      ...pattern(1, [[n + 1, [0, -1, 0]]]),
    ]),
    history: history([recorder(), push([1], n / 2 + 1, 1, 0.005, 60)]),
  }
}
/** Pinned elastica: δ/L = k/K(k) at P/Pcr = (2K(k)/π)². */
const eulerElastica = (pcr: number): [number, number][] => ([[0, pcr], ...Array.from({ length: 30 }, (_v, i) => { const k = Math.sin((i + 1) * 0.02); return [k / ellipticK(k), pcr * (2 * ellipticK(k) / Math.PI) ** 2] as [number, number] })] as [number, number][]).filter(([d]) => d <= 0.31)

/** A reinforced concrete fiber cantilever column under axial load, pushed to 4% drift with corotational geometry: the curve softens. */
function corotFiberColumn(): CaseModel {
  const h = 3
  return {
    model: modelFromWrites(2, 3, [
      ...line([0, 0], [0, h], 4, 1, 1, (id, n) => fiberEle(id, n, 1, 1)), fix(1, [1, 2, 3]), transf(1, 'Corotational'),
      concrete01(1), steel01(2), rcSection(1, 1, 2, 0.4, 0.4, 5e-4, 0.05), integration(1, 1, 'Lobatto', 5),
      ...pattern(1, [[5, [0, -1.2e6, 0]]]), ...pattern(2, [[5, [1, 0, 0]]]),
    ]),
    history: history([recorder(), gravity([1], 10, TIGHT), push([2], 5, 1, 0.002, 60, TIGHT)]),
  }
}

/** A two-story 3D frame with P-Delta columns under heavy gravity, then pushed diagonally (X and 0.6 Y at a roof corner). */
function pdeltaFrame3d(): CaseModel {
  const col = { A: 0.16, E: 30e9, G: 12.5e9, J: 3.6e-3, Iy: 2.1e-3, Iz: 2.1e-3 }, beam = { A: 0.12, E: 30e9, G: 12.5e9, J: 2e-3, Iy: 9e-4, Iz: 3.6e-3 }
  const xs = [0, 5, 10], ys = [0, 4], zs = [0, 3, 6]
  const id = (i: number, j: number, k: number) => k * 6 + j * 3 + i + 1
  const w: ModelWrite[] = [transf(1, 'PDelta', [1, 0, 0]), transf(2, 'Linear', [0, 0, 1])]
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) w.push(node(id(i, j, k), [xs[i], ys[j], zs[k]]))
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) w.push(fix(id(i, j, 0), [1, 2, 3, 4, 5, 6]))
  let e = 1
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) w.push(elastic3(e++, [id(i, j, k), id(i, j, k + 1)], col, 1))
  for (let k = 1; k < 3; k++) {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) w.push(elastic3(e++, [id(i, j, k), id(i + 1, j, k)], beam, 2))
    for (let i = 0; i < 3; i++) w.push(elastic3(e++, [id(i, 0, k), id(i, 1, k)], beam, 2))
  }
  const top = [0, 1].flatMap((j) => [0, 1, 2].map((i) => id(i, j, 2))), mid = [0, 1].flatMap((j) => [0, 1, 2].map((i) => id(i, j, 1)))
  w.push(...pattern(1, [...top, ...mid].map((n): [number, number[]] => [n, [0, 0, -1.5e6, 0, 0, 0]])))
  w.push(...pattern(2, [[id(2, 0, 2), [1, 0.6, 0, 0, 0, 0]]]))
  return { model: modelFromWrites(3, 6, w), history: history([recorder(), gravity([1], 10), push([2], id(2, 0, 2), 1, 0.002, 30)]) }
}


// ---------------------------------------------------------------------------------------------------------------------------------
// 3D fiber members
// ---------------------------------------------------------------------------------------------------------------------------------

/** An RC column (0.4 × 0.6, along Z) under constant axial load, pushed at 45° with a torque: biaxial bending, axial load and `-GJ` torsion. */
function biaxialColumn(): CaseModel {
  return {
    model: modelFromWrites(3, 6, [
      ...line([0, 0, 0], [0, 0, 3], 3, 1, 1, (id, n) => fiberEle(id, n, 1, 1)), fix(1, [1, 2, 3, 4, 5, 6]), transf(1, 'Linear', [1, 0, 0]),
      concrete01(1), steel01(2), rcSection(1, 1, 2, 0.4, 0.6, 8e-4, 0.05, 2e8), integration(1, 1, 'Legendre', 4),
      ...pattern(1, [[4, [0, 0, -1.5e6, 0, 0, 0]]]), ...pattern(2, [[4, [1, 1, 0, 0, 0, 0.2]]]),
    ]),
    history: history([recorder(), gravity([1], 10, TIGHT), push([2], 4, 1, 0.001, 50, TIGHT)]),
  }
}

/** Steel fiber sections (Steel02, material 1): a square tube `b` × `t` and an I-beam `d` deep with `bf` × `tf` flanges and a `tw` web. */
function tubeSection(id: number, b: number, t: number, gJ: number): ModelWrite {
  const h = b / 2, rect = (y1: number, z1: number, y2: number, z2: number, ny: number, nz: number) => ({ kind: 'patch' as const, subType: 'rect', args: { matTag: 1, numSubdivY: ny, numSubdivZ: nz, y1, z1, y2, z2 } })
  return { kind: 'section', entity: { id, secType: 'Fiber', args: { type: 'Fiber', secTag: id, gJ }, children: [rect(h - t, -h, h, h, 2, 8), rect(-h, -h, -h + t, h, 2, 8), rect(-h + t, -h, h - t, -h + t, 8, 2), rect(-h + t, h - t, h - t, h, 8, 2)] } }
}
function iSection(id: number, d: number, bf: number, tf: number, tw: number, gJ: number): ModelWrite {
  const rect = (y1: number, z1: number, y2: number, z2: number, ny: number, nz: number) => ({ kind: 'patch' as const, subType: 'rect', args: { matTag: 1, numSubdivY: ny, numSubdivZ: nz, y1, z1, y2, z2 } })
  return { kind: 'section', entity: { id, secType: 'Fiber', args: { type: 'Fiber', secTag: id, gJ }, children: [rect(d / 2 - tf, -bf / 2, d / 2, bf / 2, 2, 8), rect(-d / 2, -bf / 2, -d / 2 + tf, bf / 2, 2, 8), rect(-d / 2 + tf, -tw / 2, d / 2 - tf, tw / 2, 8, 1)] } }
}

/** A 1 × 1 bay, two-story fiber frame: columns with mixed `vecxz`, beams carrying 3D element loads, Lobatto integration. RC (Concrete01 +
 * Steel01 bars) or steel (Steel02 tubes and I-beams). */
function fiberFrame3d(kind: 'rc' | 'steel' = 'rc'): CaseModel & { roof: number } {
  const xs = [0, 6], ys = [0, 5], zs = [0, 3.5, 7]
  const id = (i: number, j: number, k: number) => k * 4 + j * 2 + i + 1
  const w: ModelWrite[] = [transf(1, 'Linear', [1, 0, 0]), transf(2, 'Linear', [0, 1, 0]), transf(3, 'Linear', [0, 0, 1]),
    ...(kind === 'rc'
      ? [concrete01(1), steel01(2), rcSection(1, 1, 2, 0.45, 0.45, 6e-4, 0.05, 3e8), rcSection(2, 1, 2, 0.3, 0.5, 5e-4, 0.05, 2e8)]
      : [mat(1, 'Steel02', { fy: 350e6, e0: 200e9, b: 0.01, r0: 18, cr1: 0.925, cr2: 0.15, a1: 0, a2: 1, a3: 0, a4: 1 }), tubeSection(1, 0.3, 0.015, 2.7e7), iSection(2, 0.4, 0.2, 0.015, 0.01, 1e6)]),
    integration(1, 1, 'Lobatto', 5), integration(2, 2, 'Lobatto', 5)]
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) w.push(node(id(i, j, k), [xs[i], ys[j], zs[k]]))
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) w.push(fix(id(i, j, 0), [1, 2, 3, 4, 5, 6]))
  let e = 1
  const beams: number[] = []
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) w.push(fiberEle(e++, [id(i, j, k), id(i, j, k + 1)], (i + j) % 2 ? 2 : 1, 1))
  for (let k = 1; k < 3; k++) {
    for (let j = 0; j < 2; j++) { beams.push(e); w.push(fiberEle(e++, [id(0, j, k), id(1, j, k)], 3, 2)) }
    for (let i = 0; i < 2; i++) { beams.push(e); w.push(fiberEle(e++, [id(i, 0, k), id(i, 1, k)], 3, 2)) }
  }
  w.push(...pattern(1, []), { kind: 'patternChild', patternId: 1, child: { kind: 'eleLoad', args: { eleTags: beams, wx: 0, wy: 2e3, wz: -25e3 } } })
  const roof = id(1, 1, 2)
  w.push(...pattern(2, [[id(1, 1, 1), [0.5, 0.2, 0, 0, 0, 0]], [roof, [1, 0.4, 0, 0, 0, 0]]]))
  return { model: modelFromWrites(3, 6, w), history: history([recorder(), gravity([1], 10, TIGHT), push([2], roof, 1, 0.002, 40, TIGHT)]), roof }
}

/** The steel version of the frame with floor masses under 6 s of the LOS000 record (X) and a scaled copy (Y), Rayleigh damping by coefficients. */
function fiberFrame3dEarthquake(): CaseModel {
  const f = fiberFrame3d('steel')
  const n = 600, values = FRAME_GROUND_MOTION.values.slice(0, n)
  const writes: ModelWrite[] = []
  for (const nd of f.model.nodes.values()) if (nd.coords[2] > 0) writes.push({ kind: 'mass', entity: { nodeId: nd.id, values: [8e3, 8e3, 8e3, 0, 0, 0] } })
  writes.push({ kind: 'timeSeries', entity: { id: 3, tsType: 'Path', args: { type: 'Path', tag: 3, dt: FRAME_GROUND_MOTION.dt, values, factor: 9.80665, '-prependZero': true } } })
  writes.push({ kind: 'pattern', entity: { id: 3, patternType: 'UniformExcitation', args: { type: 'UniformExcitation', patternTag: 3, dir: 1, accelSeriesTag: 3, fact: 0.5 }, children: [] } })
  writes.push({ kind: 'pattern', entity: { id: 4, patternType: 'UniformExcitation', args: { type: 'UniformExcitation', patternTag: 4, dir: 2, accelSeriesTag: 3, fact: 0.35 }, children: [] } })
  let model = f.model
  for (const w of writes) model = modelFromWritesOnto(model, w)
  return { model, history: history([recorder(true), gravity([1], 10, TIGHT), { type: 'ANALYSIS_BLOCK', blockId: 'run-earthquake-analysis', params: { patterns: [3, 4], dt: FRAME_GROUND_MOTION.dt, nSteps: n, dampingMode: 'Coefficients', alphaM: 0.5, betaK: 0.002, testType: 'NormDispIncr', tol: 1e-10, maxIter: 100 } }]) }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Cyclic material response: one bar of unit length and area, so displacement is strain and force is stress
// ---------------------------------------------------------------------------------------------------------------------------------

/** A unit bar (node 2 driven along X) of material 1 (`materials` written first), through displacement targets `targets` in steps of `inc`.
 * A second, elastic bar of 1/1000 the stiffness `k0` runs alongside so the one-dof system never goes singular where the material's tangent
 * is zero (cracked concrete, a yield plateau); the plots read the material bar's own force. */
function cyclicBar(materials: ModelWrite[], targets: number[], inc: number, k0: number, use = 1): CaseModel {
  const commands: AnalysisCommand[] = [recorder()]
  let at = 0
  for (const t of targets) {
    const steps = Math.max(1, Math.round(Math.abs(t - at) / inc))
    commands.push(push([1], 2, 1, (t - at) / steps, steps))
    at = t
  }
  return {
    model: modelFromWrites(2, 3, [
      node(1, [0, 0]), node(2, [1, 0]), fix(1, [1, 2, 3]), fix(2, [2, 3]), ...materials,
      { kind: 'element', entity: { id: 1, eleType: 'Truss', nodes: [1, 2], args: { A: 1, matTag: use } } },
      mat(99, 'Elastic', { e: k0 / 1000 }), { kind: 'element', entity: { id: 2, eleType: 'Truss', nodes: [1, 2], args: { A: 1, matTag: 99 } } },
      ...pattern(1, [[2, [1, 0, 0]]]),
    ]),
    history: history(commands),
  }
}
const growing = (y: number, amps: number[], end = 0) => [...amps.flatMap((a) => [a * y, -a * y]), end]
const hysteresis = (xLabel = 'Strain', yLabel = 'Stress'): VerificationCase['plots'] => [{ title: 'Hysteresis', x: disp(2, 1), y: { q: 'force', ele: 1, component: 2 }, xLabel, yLabel, kind: 'hysteresis', origin: true }]
const STEEL = { fy: 355e6, e0: 2e11 }
const EY = STEEL.fy / STEEL.e0

// ---------------------------------------------------------------------------------------------------------------------------------
// Dynamics
// ---------------------------------------------------------------------------------------------------------------------------------

const eigen = (modes: number): AnalysisCommand => ({ type: 'ANALYSIS_BLOCK', blockId: 'run-eigen-analysis', params: { modes } })

/** The 2D frame template (3 stories, 2 bays) with translational mass at every free node. */
function massedFrame2d(): CaseModel {
  const t = frameTemplate({ stories: 3, storyH: 3.5, bays: 2, bayW: 6, eleType: 'elasticBeamColumn', base: 'fixed' })
  let model = modelFromWrites(t.ndm, t.ndf, t.writes)
  for (const nd of [...model.nodes.values()]) if (nd.coords[1] > 0) model = modelFromWritesOnto(model, { kind: 'mass', entity: { nodeId: nd.id, values: [100, 100, 0] } })
  return { model, history: history([eigen(4)]), gridlines: t.gridlines, levels: t.levels }
}
function massedFrame3d(): CaseModel {
  const t = frame3dTemplate({ stories: 2, storyH: 3, baysX: 2, bayX: 5, baysY: 1, bayY: 4 })
  return { model: modelFromWrites(t.ndm, t.ndf, t.writes), history: history([eigen(6)]), levels: t.levels }
}
/** A 2D frame whose only mass is the beams' and columns' own (`-mass` per length); the export lumps it to the nodes, as Carapace does. */
function elementMassFrame(): CaseModel {
  const t = frameTemplate({ stories: 2, storyH: 3.5, bays: 2, bayW: 6, eleType: 'elasticBeamColumn', base: 'fixed' })
  let model = modelFromWrites(t.ndm, t.ndf, t.writes)
  model = { ...model, masses: new Map(), elements: new Map([...model.elements].map(([k, e]) => [k, { ...e, args: { ...e.args, mass: 500 } }])) }
  return { model, history: history([eigen(4)]), gridlines: t.gridlines, levels: t.levels }
}
/** A single cantilever under a short acceleration pulse, from `transient.test.ts`: nodal plus distributed beam mass, Rayleigh by coefficients. */
function pulseCantilever(ndm: 2 | 3, mode: 'Coefficients' | 'Modal periods' = 'Coefficients'): CaseModel {
  const ndf = ndm === 2 ? 3 : 6
  const values = Array.from({ length: 200 }, (_v, i) => (i < 60 ? Math.sin((Math.PI * i) / 30) : 0))
  return {
    model: modelFromWrites(ndm, ndf, [
      node(1, ndm === 2 ? [0, 0] : [0, 0, 0]), node(2, ndm === 2 ? [0, 3] : [0, 0, 3]), fix(1, Array.from({ length: ndf }, (_v, i) => i + 1)),
      { kind: 'mass', entity: { nodeId: 2, values: ndm === 2 ? [2, 2, 0] : [2, 2, 2, 0, 0, 0] } },
      { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1, ...(ndm === 3 ? { vecxz: [1, 0, 0] } : {}) } } },
      { kind: 'element', entity: { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { A: 1, E: 1000, Iz: 1, G: 400, J: 1, Iy: 2, transfTag: 1, mass: 0.5 } } },
      { kind: 'timeSeries', entity: { id: 1, tsType: 'Path', args: { type: 'Path', tag: 1, dt: 0.01, values, factor: 1 } } },
      { kind: 'pattern', entity: { id: 1, patternType: 'UniformExcitation', args: { type: 'UniformExcitation', patternTag: 1, dir: 1, accelSeriesTag: 1, fact: 1 }, children: [] } },
    ]),
    history: history([recorder(true), { type: 'ANALYSIS_BLOCK', blockId: 'run-earthquake-analysis', params: { dt: 0.01, nSteps: 400, algorithm: 'Linear', dampingMode: mode, ...(mode === 'Coefficients' ? { alphaM: 0.1, betaK: 0.001 } : { modalPeriod1: 'T1', modalPeriod2: ndm === 2 ? 'T2' : 'T3', dampingPercent: 5 }) } }]),
  }
}
/** The pulse cantilever, but the record starts at its peak instead of zero. */
function pulseCantileverNonzeroStart(): CaseModel {
  const c = pulseCantilever(2)
  const ts = c.model.timeSeries.get(1)!
  const values = (ts.args.values as number[]).map((_v, i) => (i < 60 ? Math.cos((Math.PI * i) / 30) : 0))
  c.model.timeSeries.set(1, { ...ts, args: { ...ts.args, values } })
  return c
}

/** The plate template with its slab mass: frequencies of a shell model. */
function plateModal(): CaseModel {
  const t = plateTemplate({ nx: 6, ny: 3, lx: 6, ly: 3, h: 0.2 })
  return { model: modelFromWrites(t.ndm, t.ndf, t.writes), history: history([eigen(4)]) }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Solution algorithms: the fiber cantilever pushover under each algorithm and convergence test
// ---------------------------------------------------------------------------------------------------------------------------------

function algorithmCase(settings: Record<string, unknown>): CaseModel {
  const t = cantileverTemplate({ n: 4, h: 3, eleType: 'dispBeamColumn' })
  const model = modelFromWrites(t.ndm, t.ndf, t.writes)
  return { model, history: history([recorder(), push([1], 5, 1, 0.0012, 100, { tol: 1e-12, maxIter: 200, ...settings })]) }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// zeroLengthSection hinges in a frame
// ---------------------------------------------------------------------------------------------------------------------------------

/** A 2D portal: elastic members on fiber `zeroLengthSection` base hinges. A 2D section resists axial load and bending only, so the
 * column base nodes are held horizontally. The left hinge has local x up the column; the right one runs top to bottom (nodes reversed,
 * `-orient` pointing down), which must give the same response. */
function hingeFrame(): CaseModel {
  const h = 3.5, L = 6, E = 30e9
  return {
    model: modelFromWrites(2, 3, [
      node(1, [0, 0]), node(2, [L, 0]), node(11, [0, 0]), node(12, [L, 0]), node(3, [0, h]), node(4, [L, h]), fix(1, [1, 2, 3]), fix(2, [1, 2, 3]), fix(11, [1]), fix(12, [1]),
      concrete01(1), steel01(2), rcSection(1, 1, 2, 0.4, 0.5, 8e-4, 0.05),
      { kind: 'element', entity: { id: 1, eleType: 'zeroLengthSection', nodes: [1, 11], args: { secTag: 1, orient: [0, 1, 0] } } },
      { kind: 'element', entity: { id: 2, eleType: 'zeroLengthSection', nodes: [12, 2], args: { secTag: 1, orient: [0, -1, 0] } } },
      transf(1, 'Linear'),
      elastic2(3, [11, 3], 0.2, E, 4e-3, 1), elastic2(4, [12, 4], 0.2, E, 4e-3, 1), elastic2(5, [3, 4], 0.15, E, 3e-3, 1),
      ...pattern(1, [[3, [0, -4e5, 0]], [4, [0, -4e5, 0]]]), ...pattern(2, [[3, [1, 0, 0]]]),
    ]),
    history: history([recorder(), gravity([1], 10, TIGHT), push([2], 3, 1, 0.0005, 60, TIGHT)]),
  }
}

/** Why the P-Delta cases carry a looser tolerance: a formulation difference, documented in Carapace (docs/input-format.md). */
const PDELTA_WHY = "Carapace's PDelta uses the consistent geometric stiffness, which captures both P-Δ (chord rotation) and P-δ (member curvature); OpenSees' PDelta keeps only the chord term N/L. The two agree exactly without axial load and differ by a few percent under heavy compression, with Carapace closer to the exact beam-column solution."
const PDELTA_RTOL = { value: 0.05, why: PDELTA_WHY }
/** Exact lateral stiffness of a cantilever of flexural stiffness `ei` and length `l` under axial compression `p`: p·k / (tan kL − kL). */
const beamColumnStiffness = (ei: number, l: number, p: number) => { const k = Math.sqrt(p / ei); return p * k / (Math.tan(k * l) - k * l) }

export const NEW_CASES: VerificationCase[] = [
  {
    id: 'pdelta-cantilever-2d', category: 'geometric', build: pdeltaCantilever, rtol: PDELTA_RTOL,
    plots: (m) => [pushoverCurve(m, 'Lateral load against top sway', [1]), pushoverCurve(m, 'Lateral load against top sway (P-Δ only)', [1])],
    analytical: [
      { label: 'Exact beam-column (stability functions)', plot: 0, points: () => [[0, 0], [0.05, beamColumnStiffness(200e9 * 1e-4, 3, 1e6) * 0.05]] },
      { label: 'Chord P-Δ only: (3EI/L³ − P/L)·Δ', plot: 1, points: () => [[0, 0], [0.05, (3 * 200e9 * 1e-4 / 27 - 1e6 / 3) * 0.05]] },
    ],
    shot: { view: 'front', result: 'M' }, sources: [SRC.elastic, SRC.transform],
  },
  {
    id: 'pdelta-portal-2d', category: 'geometric', build: pdeltaPortal, rtol: PDELTA_RTOL,
    plots: (m) => [pushoverCurve(m, 'Base shear against roof drift', [1])],
    shot: { view: 'front', result: 'M' }, sources: [SRC.elastic, SRC.transform],
  },
  {
    id: 'corot-cantilever-2d', category: 'geometric', build: corotCantilever,
    plots: [
      { title: 'Tip load against tip deflection (elastica)', x: neg(disp(11, 2)), y: { q: 'reaction', node: 1, dof: 2 }, xLabel: '−v / L', yLabel: 'PL² / EI', origin: true },
      { title: 'Tip shortening', x: neg(disp(11, 1)), y: { q: 'reaction', node: 1, dof: 2 }, xLabel: '−u / L', yLabel: 'PL² / EI', origin: true },
    ],
    analytical: [{ label: 'Elastica (Mattiasson 1981)', plot: 0, points: () => [[0, 0], ...ELASTICA.map(([p, , v]): [number, number] => [v, p])] }],
    shot: { view: 'front', result: 'deformed' }, sources: [SRC.elastic, SRC.transform],
  },
  {
    id: 'corot-euler-column-2d', category: 'geometric', build: corotEuler,
    plots: [{ title: 'Axial load against mid-height sway', x: disp(6, 1), y: { q: 'reaction', node: 1, dof: 2 }, xLabel: 'δ / L', yLabel: 'P (Pcr = π² EI/L² = 9.87)', origin: true }],
    analytical: [{ label: 'Elastica, P/Pcr = (2K(k)/π)²', plot: 0, points: () => eulerElastica(Math.PI ** 2) }],
    shot: { view: 'front', result: 'deformed' }, sources: [SRC.elastic, SRC.transform],
  },
  {
    id: 'corot-fiber-column-2d', category: 'geometric', build: corotFiberColumn,
    rtol: { value: 2e-4, quantities: ['force'], why: 'Under Corotational geometry OpenSees reports a member\'s local end shear as (Mi + Mj)/L0, with the undeformed length; Carapace divides by the current chord length, which is what equilibrium of the deformed member gives. End moments, axial forces, displacements and reactions agree to 1e-6; the end shears differ by the ratio of the two lengths (up to 0.1% of the shear here).' },
    plots: (m) => [pushoverCurve(m, 'Lateral load against top drift', [1])],
    shot: { view: 'front', result: 'M', extruded: true }, sources: [SRC.disp, SRC.fiber, SRC.transform, SRC.concrete01, SRC.steel01],
  },
  {
    id: 'pdelta-frame-3d', category: 'geometric', build: pdeltaFrame3d, rtol: PDELTA_RTOL,
    plots: (m) => [{ title: 'Base shear X', x: disp(15, 1), y: baseShear(m, 1), xLabel: 'Roof corner X displacement (m)', yLabel: 'Base shear X (N)', stages: [1] }, { title: 'Base shear Y', x: disp(15, 2), y: baseShear(m, 2), xLabel: 'Roof corner Y displacement (m)', yLabel: 'Base shear Y (N)', stages: [1] }],
    shot: { view: '3d', result: 'deformed', extruded: true }, sources: [SRC.elastic, SRC.transform],
  },

  // 3D fiber members
  {
    id: 'fiber-column-biaxial-3d', category: 'fiber3d', build: biaxialColumn,
    plots: (m) => [pushoverCurve(m, 'Base shear X against top X displacement', [1]), { title: 'Base moments: interaction path', x: { q: 'reaction', node: 1, dof: 4 }, y: { q: 'reaction', node: 1, dof: 5 }, xLabel: 'Mx (N·m)', yLabel: 'My (N·m)', stages: [0, 1], origin: true }, { title: 'Twist at the top', x: disp(4, 1), y: disp(4, 6), xLabel: 'Top X displacement (m)', yLabel: 'Top rotation about Z (rad)', stages: [1] }],
    shot: { view: '3d', result: 'deformed', extruded: true }, sources: [SRC.disp, SRC.fiber, SRC.integration, SRC.concrete01, SRC.steel01],
  },
  {
    id: 'fiber-frame-3d', category: 'fiber3d', build: fiberFrame3d,
    plots: (m) => [{ title: 'Pushover curve', x: disp(12, 1), y: baseShear(m, 1), xLabel: 'Roof X displacement (m)', yLabel: 'Base shear X (N)', stages: [1] }, { title: 'Roof Y drift from the coupled push', x: disp(12, 1), y: disp(12, 2), xLabel: 'Roof X displacement (m)', yLabel: 'Roof Y displacement (m)', stages: [1] }],
    shot: { view: '3d', result: 'M', extruded: true }, sources: [SRC.disp, SRC.fiber, SRC.integration, SRC.concrete01, SRC.steel01],
  },
  {
    id: 'fiber-frame-3d-earthquake', category: 'fiber3d', build: fiberFrame3dEarthquake,
    plots: (m) => [{ title: 'Roof displacement X', x: { q: 'time' }, y: disp(12, 1), xLabel: 'Time (s)', yLabel: 'Roof X displacement (m)', stages: [1] }, { title: 'Roof displacement Y', x: { q: 'time' }, y: disp(12, 2), xLabel: 'Time (s)', yLabel: 'Roof Y displacement (m)', stages: [1] }, { title: 'Base shear against roof drift', x: disp(12, 1), y: baseShear(m, 1), xLabel: 'Roof X displacement (m)', yLabel: 'Base shear X (N)', kind: 'hysteresis', stages: [1] }],
    shot: { view: '3d', result: 'deformed', extruded: true }, sources: [SRC.disp, SRC.fiber, SRC.transient, SRC.damping, SRC.groundMotion],
  },
  // Cyclic material response
  { id: 'cyclic-steel01', category: 'cyclic', build: () => cyclicBar([mat(1, 'Steel01', { ...STEEL, b: 0.02 })], growing(EY, [1, 2, 4, 6]), EY / 20, 2e11), plots: hysteresis(), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.steel01] },
  { id: 'cyclic-steel02', category: 'cyclic', build: () => cyclicBar([mat(1, 'Steel02', { ...STEEL, b: 0.01, r0: 18, cr1: 0.925, cr2: 0.15, a1: 0, a2: 1, a3: 0, a4: 1 })], growing(EY, [1, 2, 4, 6]), EY / 20, 2e11), plots: hysteresis(), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.steel02] },
  { id: 'cyclic-concrete01', category: 'cyclic', build: () => cyclicBar([mat(1, 'Concrete01', { fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006 })], [-0.001, 0.0002, -0.002, 0.0005, -0.004, 0.001, -0.006, 0], 5e-5, 3e10), plots: hysteresis(), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.concrete01] },
  { id: 'cyclic-concrete02', category: 'cyclic', build: () => cyclicBar([mat(1, 'Concrete02', { fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006, lambda: 0.1, ft: 3e6, ets: 3e9 })], [-0.001, 0.0004, -0.002, 0.0008, -0.004, 0.001, -0.006, 0], 5e-5, 3e10), plots: hysteresis(), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.concrete02] },
  { id: 'cyclic-hysteretic', category: 'cyclic', build: () => cyclicBar([mat(1, 'Hysteretic', { p1: [2e5, 1e-3], p2: [3e5, 4e-3], p3: [2.5e5, 8e-3], n1: [-2e5, -1e-3], n2: [-3e5, -4e-3], n3: [-2.5e5, -8e-3], pinchX: 0.8, pinchY: 0.5, damage1: 0.01, damage2: 0.01, beta: 0.2 })], growing(1e-3, [1, 2, 4, 7]), 5e-5, 2e8), plots: hysteresis('Deformation', 'Force'), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.hysteretic] },
  { id: 'cyclic-pinching4', category: 'cyclic', build: () => cyclicBar([mat(1, 'Pinching4', { ePf1: 2e5, ePd1: 1e-3, ePf2: 3e5, ePd2: 3e-3, ePf3: 3.5e5, ePd3: 6e-3, ePf4: 1e5, ePd4: 1.2e-2, eNf1: -2e5, eNd1: -1e-3, eNf2: -3e5, eNd2: -3e-3, eNf3: -3.5e5, eNd3: -6e-3, eNf4: -1e5, eNd4: -1.2e-2, rDispP: 0.5, rForceP: 0.25, uForceP: 0.05, rDispN: 0.5, rForceN: 0.25, uForceN: 0.05, gK1: 0.1, gK2: 0, gK3: 0.1, gK4: 0, gKLim: 0.5, gD1: 0.1, gD2: 0, gD3: 0.1, gD4: 0, gDLim: 0.5, gF1: 0, gF2: 0, gF3: 0, gF4: 0, gFLim: 0.5, gE: 10, dmgType: 'energy' })], growing(1e-3, [1, 2, 4, 7]), 5e-5, 2e8), plots: hysteresis('Deformation', 'Force'), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.pinching4] },
  { id: 'cyclic-elasticpp', category: 'cyclic', build: () => cyclicBar([mat(1, 'ElasticPP', { e: 2e11, epsyP: EY })], growing(EY, [1, 2, 4]), EY / 20, 2e11), plots: hysteresis(), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.elasticLike] },
  { id: 'cyclic-ent', category: 'cyclic', build: () => cyclicBar([mat(1, 'ENT', { e: 2e11 })], growing(EY, [1, 2]), EY / 20, 2e11), plots: hysteresis(), shot: { view: 'front', result: 'N' }, sources: [SRC.truss, SRC.elasticLike] },
  // Dynamics
  {
    id: 'modal-frame-2d', category: 'dynamics', build: massedFrame2d, modes: 4, plots: [],
    shot: { view: 'front', result: 'mode' }, sources: [SRC.modal, SRC.elastic],
  },
  {
    id: 'modal-frame-3d', category: 'dynamics', build: massedFrame3d, modes: 6, plots: [],
    shot: { view: '3d', result: 'mode' }, sources: [SRC.modal, SRC.elastic],
  },
  {
    id: 'modal-element-mass', category: 'dynamics', build: elementMassFrame, modes: 4, plots: [],
    shot: { view: 'front', result: 'mode' }, sources: [SRC.modal, SRC.elastic],
  },
  {
    id: 'modal-plate', category: 'dynamics', build: plateModal, modes: 4, plots: [],
    rtol: { value: 0.15, why: "Carapace lumps a shell's mass at its nodes (translations only); OpenSees' ShellMITC4 forms a consistent mass matrix. Both are standard; the consistent mass gives somewhat lower frequencies for a coarse mesh, and the two converge as the mesh is refined. Stiffness is identical: static plate results agree to 1e-6." },
    shot: { view: '3d', result: 'mode' }, sources: [SRC.modal, SRC.shell4, SRC.shellSection],
  },
  ...([2, 3] as const).map((ndm): VerificationCase => ({
    id: `transient-cantilever-${ndm}d`, category: 'dynamics', build: () => pulseCantilever(ndm),
    plots: [{ title: 'Tip displacement', x: { q: 'time' }, y: disp(2, 1), xLabel: 'Time', yLabel: 'Tip X displacement (relative)' }, { title: 'Tip acceleration (relative)', x: { q: 'time' }, y: { q: 'accel', node: 2, dof: 1 }, xLabel: 'Time', yLabel: 'Tip X acceleration' }],
    shot: { view: ndm === 2 ? 'front' : '3d', result: 'deformed' }, sources: [SRC.transient, SRC.damping, SRC.groundMotion, SRC.elastic],
  })),
  {
    id: 'transient-nonzero-initial-acceleration', category: 'dynamics', build: pulseCantileverNonzeroStart,
    rtol: { value: 0.3, why: "The record starts at a non-zero acceleration. Carapace starts the Newmark integration from the consistent initial acceleration (M·a₀ = −M·ι·ag(0) − C·v₀ − K·u₀), OpenSees from a₀ = 0, so the relative acceleration differs by the initial ground acceleration at the start and the difference decays with damping (displacements differ far less). Records that start at zero (or are padded with -prependZero, as PySees does for imported records) agree to 1e-6." },
    plots: [{ title: 'Tip displacement', x: { q: 'time' }, y: disp(2, 1), xLabel: 'Time', yLabel: 'Tip X displacement (relative)' }, { title: 'Tip acceleration (relative)', x: { q: 'time' }, y: { q: 'accel', node: 2, dof: 1 }, xLabel: 'Time', yLabel: 'Tip X acceleration' }],
    shot: { view: 'front', result: 'deformed' }, sources: [SRC.transient, SRC.groundMotion],
  },
  {
    id: 'transient-modal-damping', category: 'dynamics', build: () => pulseCantilever(3, 'Modal periods'),
    plots: [{ title: 'Tip displacement', x: { q: 'time' }, y: disp(2, 1), xLabel: 'Time', yLabel: 'Tip X displacement (relative)' }, { title: 'Tip velocity (relative)', x: { q: 'time' }, y: { q: 'vel', node: 2, dof: 1 }, xLabel: 'Time', yLabel: 'Tip X velocity' }],
    shot: { view: '3d', result: 'deformed' }, sources: [SRC.transient, SRC.damping, SRC.modal],
  },
  // Solution algorithms
  ...([
    ['newton-norm-unbalance', { algorithm: 'Newton', testType: 'NormUnbalance', tol: 1e-6 }],
    ['newton-energy-incr', { algorithm: 'Newton', testType: 'EnergyIncr', tol: 1e-16 }],
    ['modified-newton', { algorithm: 'ModifiedNewton' }],
    ['krylov-newton', { algorithm: 'KrylovNewton' }],
    ['newton-line-search', { algorithm: 'NewtonLineSearch' }],
  ] as [string, Record<string, unknown>][]).map(([id, settings]): VerificationCase => ({
    id: `algorithm-${id}`, category: 'solution', build: () => algorithmCase(settings),
    plots: (m) => [pushoverCurve(m)],
    shot: { view: 'front', result: 'M' }, sources: [SRC.algorithm, SRC.convergence, ...(id.includes('krylov') ? [SRC.krylov] : id.includes('line') ? [SRC.lineSearch] : []), SRC.disp],
  })),
  // Material nonlinearity: hinges
  {
    id: 'zero-length-section-hinges', category: 'material', build: hingeFrame,
    plots: (m) => [pushoverCurve(m, 'Pushover curve', [1]), { title: 'Hinge rotations', x: disp(3, 1), y: disp(11, 3), xLabel: 'Roof X displacement (m)', yLabel: 'Left hinge rotation (rad)', stages: [1] }],
    shot: { view: 'front', result: 'M' }, sources: [SRC.fiber, SRC.zeroLength, SRC.concrete01, SRC.steel01],
  },
]
