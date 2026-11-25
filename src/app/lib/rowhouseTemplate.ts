import type { ModelWrite } from '@/app/lib/modelWrite'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import type { BaseUnits } from '@/app/lib/units/units'
import type { UnderlayEntity } from '@/app/types/underlays'
import { emptyModel, type Model } from '@/app/types/model'
import { DrawBatch } from '@/app/lib/editor/draw'
import { assignDiaphragms } from '@/app/lib/editor/edit'
import { drawStudWall, studWallArgs, type DrawnOpening, type StudWallTemplate } from '@/app/lib/studWalls'
import type { FloorAreaLoadArgs, JoistFloorArgs } from '@/app/lib/floors'
import { gradeE, lumberScale, sizeOf, type WallFraming } from '@/app/lib/lumber'

/**
 * BC Rowhouse (CMHC Housing Design Catalogue, BC prototypical design; sheets A101–A103, A200–A300, S101–S103): two 2-storey units, each
 * 18'-0" (5486 mm) wide, the east unit one 2057 mm bay north of the west one and mirrored about the party wall (grid 3). Grids 1–5 at
 * 2743 mm, D–C 2057, C–B 8306, B–A 2057 (D at y = 0, north up); wall centrelines on the grids. Main floor 0, second floor 2858 (T/O F/F),
 * roof bearing 5664 (2504 mm second-storey framing + the roof framing zone). N, mm, s. See docs/rowhouse-template.md.
 *
 * Second floor framing (S102), unit 1 (unit 2 mirrored): joists cantilever 610 mm past the south wall and back-span to a (5) 2x12 beam
 * (west wall to the interior bearing wall) and to a (3) 2x12 header across the south end of the stair void (interior wall to party wall);
 * north of those the joists turn east–west, west wall to interior wall and interior wall to party wall north of the stair void. The
 * second-storey south walls stand on the cantilever: their pier ends sit on (2) 2x12 joists modelled as beams (wall, beam).
 */

export const ROWHOUSE_PDF = { url: '/templates/bc-rowhouse-plans.pdf', fileName: 'BC Rowhouse plans.pdf' }
export const ROWHOUSE_UNITS: BaseUnits = { length: 'mm', force: 'N', time: 's' }

type P = [number, number]
const X = [0, 2743, 5486, 8229, 10972] // grids 1–5
const Y = { D: 0, C: 2057, B: 10363, A: 12420 }
const FLOOR = 2858, ROOF = 5664, DEPTH = 302 // 2x12 + 16 mm ply
const CANT = 610
const WIN = 2134, DOOR = 2083
/** Unit 2 from unit 1: mirrored about grid 3, one bay north. */
const mirror = ([x, y]: P): P => [2 * X[2] - x, y + Y.C]

const win = (x0: number, x1: number, sill: number, o: Partial<DrawnOpening> = {}): DrawnOpening => ({ x0, x1, head: WIN, door: false, sill, ...o })
const door = (x0: number, x1: number, o: Partial<DrawnOpening> = {}): DrawnOpening => ({ x0, x1, head: DOOR, door: true, ...o })
const H3 = { header: '2x12', headerPlies: 3 } // (3) 2x12 headers (S102) where the floor bears over an opening

interface WallDef { name: string; a: P; b: P; openings: DrawnOpening[]; interior?: boolean }
/** The unit 1 interior bearing wall (main floor, by the stair): from its south end to the north wall, its three door openings. */
const INTERIOR_U1: P = [4000, 2010]
const interiorDoors = () => [door(3508, 4371, H3), door(5268, 6412), door(6780, 8076)]

/** Main floor walls (start → end; openings in wall-local x from the start). */
const S1: WallDef[] = [
  { name: 'U1 north', a: [X[0], Y.B], b: [X[2], Y.B], openings: [win(914, 1828, 203), door(2361, 3885)] },
  { name: 'U1 south', a: [X[0], Y.D], b: [X[2], Y.D], openings: [win(914, 2742, 203, H3), door(3555, 5079, H3)] },
  { name: 'U1 west', a: [X[0], Y.D], b: [X[0], Y.B], openings: [win(3959, 4873, 1219)] },
  { name: 'U2 north', a: [X[2], Y.A], b: [X[4], Y.A], openings: [door(1600, 3124), win(3657, 4571, 203)] },
  { name: 'U2 south', a: [X[2], Y.C], b: [X[4], Y.C], openings: [door(406, 1930, H3), win(2743, 4571, 203, H3)] },
  { name: 'U2 east', a: [X[4], Y.C], b: [X[4], Y.A], openings: [win(3959, 4873, 1219)] },
  { name: 'Grid 3 D–C', a: [X[2], Y.D], b: [X[2], Y.C], openings: [] },
  { name: 'Party wall', a: [X[2], Y.C], b: [X[2], Y.B], openings: [] },
  { name: 'Grid 3 B–A', a: [X[2], Y.B], b: [X[2], Y.A], openings: [] },
  { name: 'U1 interior', a: INTERIOR_U1, b: [INTERIOR_U1[0], Y.B], openings: interiorDoors(), interior: true },
  { name: 'U2 interior', a: mirror(INTERIOR_U1), b: [mirror(INTERIOR_U1)[0], Y.A], openings: interiorDoors(), interior: true },
]
/** Second floor walls: the south walls and the south ends of the side walls stand on the 610 mm cantilever. */
const S2: WallDef[] = [
  { name: 'U1 north', a: [X[0], Y.B], b: [X[2], Y.B], openings: [win(914, 3656, 305)] },
  { name: 'U1 south', a: [X[0], Y.D - CANT], b: [X[2], Y.D - CANT], openings: [win(914, 2742, 305), win(3555, 4469, 305)] },
  { name: 'U1 west', a: [X[0], Y.D - CANT], b: [X[0], Y.B], openings: [win(3963, 4877, 1219), win(6096, 7010, 1219)] },
  { name: 'U2 north', a: [X[2], Y.A], b: [X[4], Y.A], openings: [win(1829, 4571, 305)] },
  { name: 'U2 south', a: [X[2], Y.C - CANT], b: [X[4], Y.C - CANT], openings: [win(1016, 1930, 305), win(2743, 4571, 305)] },
  { name: 'U2 east', a: [X[4], Y.C - CANT], b: [X[4], Y.A], openings: [win(3963, 4877, 1219), win(6096, 7010, 1219)] },
  { name: 'Grid 3 U1 east', a: [X[2], Y.D - CANT], b: [X[2], Y.C - CANT], openings: [] },
  { name: 'Party wall', a: [X[2], Y.C - CANT], b: [X[2], Y.B], openings: [] },
  { name: 'Grid 3 B–A', a: [X[2], Y.B], b: [X[2], Y.A], openings: [] },
]

/** Second floor beams of unit 1 (S102): the (5) 2x12 the cantilever backs onto and the (3) 2x12 header at the stair void's south end. */
const BEAMS_U1: { name: string; a: P; b: P; plies: number }[] = [
  { name: '(5) 2x12', a: [X[0], 3140], b: [INTERIOR_U1[0], 3140], plies: 5 },
  { name: '(3) 2x12', a: [INTERIOR_U1[0], 2440], b: [X[2], 2440], plies: 3 },
]
const VOID_NORTH_U1 = 5970
/** Joist zones of unit 1's second floor (outline, joist angle): the cantilever (N–S), west of the interior wall and north of the stair
 * void (E–W). The stair void (interior wall to party wall, header to 5970) is left open. */
const ZONES_U1: { name: string; pts: P[]; angle: number }[] = [
  { name: 'cantilever', angle: 90, pts: [[X[0], Y.D - CANT], [X[2], Y.D - CANT], [X[2], 2440], [INTERIOR_U1[0], 2440], [INTERIOR_U1[0], 3140], [X[0], 3140]] },
  { name: 'west', angle: 0, pts: [[X[0], 3140], [INTERIOR_U1[0], 3140], [INTERIOR_U1[0], Y.B], [X[0], Y.B]] },
  { name: 'stair side', angle: 0, pts: [[INTERIOR_U1[0], VOID_NORTH_U1], [X[2], VOID_NORTH_U1], [X[2], Y.B], [INTERIOR_U1[0], Y.B]] },
]

const FRAMING: WallFraming = { grade: 'o86-spf', stud: '2x6', endPlies: 3, topPlies: 2, bottomPlies: 1, headerGrade: 'o86-dfl', rim: { size: 'rim38', plies: 1, grade: 'o86-spf' }, openings: [] }
/** 2x6 @ 400 with 12.5 mm ply (SW1-A: 3.33 mm nails @ 100), the floor zone at each level, linear hold-downs. EAs come from `FRAMING`. */
const WALL: StudWallTemplate = {
  spacing: 400, studEa: 0, endEa: 0, topEa: 0, topDistribution: 'beam', bottomEa: 0, bottomEi: 0,
  law: { kind: 'o86', bv: 11000, nailSpacing: 100, nailDiameter: 3.33 }, floor: { depth: DEPTH, ga: 10000, rimEa: 0 },
  holdDown: { tension: 15000, k: 1e6 }, framing: FRAMING,
}
/** Interior bearing walls: gypsum, not shear walls (a nominal linear Ga). */
const INTERIOR: StudWallTemplate = { ...WALL, law: { kind: 'linear', ga: 1000 } }

/** Area loads (N/mm²) and the lateral storey forces (N) of the template's patterns. */
export const ROWHOUSE_LOADS = { floorDead: 1.2e-3, floorLive: 1.9e-3, roofDead: 1.0e-3, snow: 1.6e-3, eqFloor: 26000, eqRoof: 45000 }

/** Sheets of `ROWHOUSE_PDF` (page, level, placement fitted to the walls at 1/4" = 1'-0"; the S sheets print about 1.6 % small). */
const SHEETS: { page: number; name: string; level: number | null; origin: P; scale: number; visible: boolean }[] = [
  { page: 1, name: 'A101 Main floor plan', level: null, origin: [-13819.3, -8545.7], scale: 16.95593, visible: true },
  { page: 2, name: 'A102 Second floor plan', level: 1, origin: [-13819.3, -8545.7], scale: 16.95593, visible: true },
  { page: 3, name: 'A103 Roof plan', level: 2, origin: [-13801.1, -8537.4], scale: 16.94168, visible: true },
  { page: 4, name: 'S101 Foundation / main floor', level: null, origin: [-15673.6, -6946.7], scale: 17.19497, visible: false },
  { page: 5, name: 'S102 Second floor framing', level: 1, origin: [-15690.5, -6963.9], scale: 17.21291, visible: false },
  { page: 6, name: 'S103 Roof framing', level: 2, origin: [-15730.8, -6986.0], scale: 17.2352, visible: false },
]
const PAGE: [number, number] = [2592, 1728]

export interface RowhouseTemplate {
  ndm: 3; ndf: 6; units: BaseUnits; writes: ModelWrite[]; analysisCommands: AnalysisCommand[]; gridlines: GridlineEntity[]; levels: LevelEntity[]
  /** The underlays to add once the PDF is stored (`file` = its hash). */
  underlays: (file: string) => Omit<UnderlayEntity, 'id'>[]
}

/** Every entity of `m` as writes, in an order `applyModelWrites` accepts. */
function modelWrites(m: Model): ModelWrite[] {
  return [
    ...[...m.nodes.values()].map((entity): ModelWrite => ({ kind: 'node', entity })),
    ...[...m.materials.values()].map((entity): ModelWrite => ({ kind: 'material', entity })),
    ...[...m.geomTransfs.values()].map((entity): ModelWrite => ({ kind: 'geomTransf', entity })),
    ...[...m.elements.values()].map((entity): ModelWrite => ({ kind: 'element', entity })),
    ...[...m.fixes.values()].map((entity): ModelWrite => ({ kind: 'fix', entity })),
    ...[...m.mpConstraints.values()].map((entity): ModelWrite => ({ kind: 'mpConstraint', entity })),
    ...[...m.timeSeries.values()].map((entity): ModelWrite => ({ kind: 'timeSeries', entity })),
    ...[...m.patterns.values()].map((entity): ModelWrite => ({ kind: 'pattern', entity })),
  ]
}

const len = (w: { a: P; b: P }) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
/** Wall-local x of `p` when it lies on the segment a–b (within 1 mm), else null. */
function along(w: { a: P; b: P }, p: P): number | null {
  const L = len(w), ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L, dx = p[0] - w.a[0], dy = p[1] - w.a[1]
  const x = dx * ux + dy * uy
  return Math.abs(dx * uy - dy * ux) <= 1 && x >= -1 && x <= L + 1 ? Math.min(Math.max(x, 0), L) : null
}
const at = (w: { a: P; b: P }, x: number): P => { const L = len(w); return [w.a[0] + (w.b[0] - w.a[0]) * x / L, w.a[1] + (w.b[1] - w.a[1]) * x / L] }
/** Plan points of a wall's pier ends: its ends and its opening edges. */
const pierPoints = (w: WallDef): P[] => [0, len(w), ...w.openings.flatMap((o) => [o.x0, o.x1])].map((x) => at(w, x))
const same = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1

/** Elastic properties of `plies` × a lumber size about its strong axis (vertical bending: local z is up for a level member). */
function lumberMember(grade: string, size: string, plies: number) {
  const s = lumberScale(ROWHOUSE_UNITS, 2400), z = sizeOf(size)!, E = gradeE(grade, undefined, s), b = z.b * plies, d = z.d
  const [t, w] = b < d ? [b, d] : [d, b]
  return { A: b * d, E, G: E / 16, J: (w * t ** 3 / 3) * (1 - 0.63 * t / w), Iy: b * d ** 3 / 12, Iz: d * b ** 3 / 12 }
}

export function rowhouseTemplate(): RowhouseTemplate {
  const b = new DrawBatch({ ...emptyModel(), config: { ndm: 3, ndf: 6, units: ROWHOUSE_UNITS } })
  const units = <T,>(u1: T[], m: (t: T) => T) => [...u1, ...u1.map(m)]
  const beams = units(BEAMS_U1, (x) => ({ ...x, a: mirror(x.a), b: mirror(x.b) }))
  const zones = units(ZONES_U1.map((z) => ({ ...z, unit: 1 })), (z) => ({ ...z, unit: 2, pts: z.pts.map(mirror).reverse() }))

  // Cantilevered joists under every second-floor pier end that has no wall below: tip, the south wall below, back to a beam.
  const onS1 = (p: P) => S1.some((w) => along(w, p) !== null)
  const joists: P[][] = []
  for (const w of S2) for (const tip of pierPoints(w)) {
    if (onS1(tip) || joists.some((j) => same(j[0], tip))) continue
    const south = S1.find((x) => x.name.endsWith('south') && Math.abs(x.a[1] - (tip[1] + CANT)) <= 1 && along(x, [tip[0], tip[1] + CANT]) !== null)
    const beam = beams.find((m) => along(m, [tip[0], m.a[1]]) !== null && m.a[1] > tip[1])
    if (!south || !beam) throw new Error(`rowhouse: no support for the cantilever at ${tip}`)
    joists.push([tip, [tip[0], tip[1] + CANT], [tip[0], beam.a[1]]])
  }

  // Main floor walls, with studs wherever something lands on them (a pier end above, a beam or joist, a floor corner).
  const landing: P[] = [...S2.flatMap(pierPoints), ...beams.flatMap((m) => [m.a, m.b]), ...joists.flat(), ...zones.flatMap((z) => z.pts)]
  for (const w of S1) {
    const studs = landing.map((p) => along(w, p)).filter((x): x is number => x !== null && x > 1 && x < len(w) - 1)
    drawStudWall(b, w.a, w.b, 0, FLOOR, w.interior ? INTERIOR : WALL, `S1 ${w.name}`, { openings: w.openings, studs })
  }
  // Beams and cantilevered joists as elastic members at the floor (nodes merge with the walls' top stations).
  const frame = (pts: P[], member: ReturnType<typeof lumberMember>) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const n0 = b.node([pts[i][0], pts[i][1], FLOOR]), n1 = b.node([pts[i + 1][0], pts[i + 1][1], FLOOR])
      const transfTag = b.transform([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], 0], 'Linear')
      b.writeRaw({ kind: 'element', entity: { id: b.model.nextIds.element, eleType: 'ElasticBeamColumn', nodes: [n0, n1], args: { ...member, transfTag } } })
    }
  }
  for (const m of beams) {
    const xs = [0, len(m), ...joists.map((j) => along(m, j[2])).filter((x): x is number => x !== null)]
    frame([...new Set(xs.map(Math.round))].sort((p, q) => p - q).map((x) => at(m, x)), lumberMember('o86-dfl', '2x12', m.plies))
  }
  const joist = lumberMember('o86-spf', '2x12', 2)
  for (const j of joists) frame(j, joist)

  // Second floor walls: pier ends held down to the wall below or to a cantilevered joist.
  for (const w of S2) drawStudWall(b, w.a, w.b, FLOOR, ROOF, WALL, `S2 ${w.name}`, { openings: w.openings })

  // Rigid diaphragms at the second floor and roof over every wall's top nodes and the floor members.
  const tops = [...b.model.elements.values()].flatMap((e) => e.eleType === 'studWall' ? [e.nodes[2], e.nodes[3], ...studWallArgs(e.args).stations.flatMap((s, i) => (s.chord === 'top' ? [e.nodes[4 + i]] : []))] : e.eleType === 'ElasticBeamColumn' ? e.nodes : [])
  const { model: withDiaphragms } = assignDiaphragms(b.model, tops)
  const masters = new Map([...withDiaphragms.mpConstraints.values()].filter((c) => c.kind === 'rigidDiaphragm').map((c) => [Math.round(withDiaphragms.nodes.get(Number(c.args.rNodeTag))!.coords[2]), Number(c.args.rNodeTag)]))
  const d = new DrawBatch(withDiaphragms)

  // Joist floors: the second-floor zones and each unit's roof (E–W between grids 1/3/5, over the cantilever too).
  const floor = (label: string, pts: P[], z: number, angle: number) => {
    const nodes = pts.map((p) => d.node([p[0], p[1], z]))
    const id = d.model.nextIds.element
    const args: JoistFloorArgs = { label, angle, spacing: 400, joist: { grade: 'o86-spf', size: '2x12', plies: 1 }, continuity: 'continuous', subfloor: 16 }
    d.writeRaw({ kind: 'element', entity: { id, eleType: 'joistFloor', nodes, args: args as unknown as Record<string, unknown> } })
    return id
  }
  const floors = zones.map((z) => floor(`U${z.unit} second floor, ${z.name}`, z.pts, FLOOR, z.angle))
  const roofs = [floor('U1 roof', [[X[0], Y.D - CANT], [X[2], Y.D - CANT], [X[2], Y.B], [X[0], Y.B]], ROOF, 0), floor('U2 roof', [[X[2], Y.C - CANT], [X[4], Y.C - CANT], [X[4], Y.A], [X[2], Y.A]], ROOF, 0)]

  // Patterns: dead, live, snow on the floors; earthquake X and Y at the diaphragm masters. Both lateral patterns ramp in the second stage
  // (every pattern is active in OpenSees and Carapace); Y has scale factor 0, so swap the two factors to run Y.
  const L = ROWHOUSE_LOADS
  const pattern = (id: number, name: string, fact = 1) => {
    d.writeRaw({ kind: 'timeSeries', entity: { id, tsType: 'Linear', args: { type: 'Linear', tag: id, factor: 1 } } })
    d.writeRaw({ kind: 'pattern', entity: { id, name, patternType: 'Plain', args: { type: 'Plain', patternTag: id, tsTag: id, fact }, children: [] } })
  }
  const area = (pat: number, floorId: number, w: number) => { const args: FloorAreaLoadArgs = { floor: floorId, loads: [{ kind: 'area', w }] }; d.writeRaw({ kind: 'patternChild', patternId: pat, child: { kind: 'floorLoad', args: args as unknown as Record<string, unknown> } }) }
  pattern(1, 'Dead'); pattern(2, 'Live'); pattern(3, 'Snow'); pattern(4, 'Earthquake X'); pattern(5, 'Earthquake Y', 0)
  for (const f of floors) { area(1, f, L.floorDead); area(2, f, L.floorLive) }
  for (const r of roofs) { area(1, r, L.roofDead); area(3, r, L.snow) }
  for (const [z, force] of [[FLOOR, L.eqFloor], [ROOF, L.eqRoof]] as const) {
    const node = masters.get(z)!
    d.writeRaw({ kind: 'patternChild', patternId: 4, child: { kind: 'load', args: { nodeTag: node, values: [force, 0, 0, 0, 0, 0] } } })
    d.writeRaw({ kind: 'patternChild', patternId: 5, child: { kind: 'load', args: { nodeTag: node, values: [0, force, 0, 0, 0, 0] } } })
  }

  const analysisCommands: AnalysisCommand[] = [
    { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1, 2, 3], steps: 5, holdLoads: 'Yes', algorithm: 'Newton', tol: 1e-7, maxIter: 100 } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [4, 5], steps: 10, holdLoads: 'Yes', algorithm: 'Newton', tol: 1e-7, maxIter: 100 } },
  ]
  const over = 1500
  const gridlines: GridlineEntity[] = [
    ...X.map((x, i) => ({ id: i + 1, label: String(i + 1), start: [x, Y.D - over], end: [x, Y.A + over] })),
    ...(['A', 'B', 'C', 'D'] as const).map((k, i) => ({ id: X.length + i + 1, label: k, start: [X[0] - over, Y[k]], end: [X[4] + over, Y[k]] })),
  ]
  const levels: LevelEntity[] = [{ id: 1, label: 'Second floor', height: FLOOR }, { id: 2, label: 'Roof', height: ROOF - FLOOR }]
  const underlays = (file: string) => SHEETS.map((s): Omit<UnderlayEntity, 'id'> => ({
    name: s.name, file, fileName: ROWHOUSE_PDF.fileName, page: s.page, pageSize: PAGE, level: s.level, origin: s.origin, scale: s.scale, rotation: 0, opacity: 0.6, knockout: true, visible: s.visible,
  }))
  return { ndm: 3, ndf: 6, units: ROWHOUSE_UNITS, writes: modelWrites(d.model), analysisCommands, gridlines, levels, underlays }
}

/** Plan area of the second floors (both units, cantilever included, stair voids out) and of the roofs, for checks. */
export function rowhouseAreas() {
  const poly = (pts: P[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
  const floor = 2 * ZONES_U1.reduce((s, z) => s + poly(z.pts), 0)
  const roof = 2 * (X[2] - X[0]) * (Y.B - Y.D + CANT)
  return { floor, roof }
}
