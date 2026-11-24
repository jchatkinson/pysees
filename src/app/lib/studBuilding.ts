import type { StudBuildingParams } from '@/app/types/model'
import type { BuildingSpec, RecorderSpecWire, StudWallBaseComponent, StudWallQuantity, WallLayoutSpec, WallSpec } from '@/app/types/carapaceInputV1'

export const STUD_BUILDING_DEFAULTS: StudBuildingParams = {
  storeys: 3, length: 8000, width: 6000, wallHeight: 2440, floorDepth: 254, studSpacing: 406, windowWidth: 1200, windowHead: 2100,
  noWindows: false, sheathing: 'o86', diaphragm: 'rigid', steps: 10, lateralShear: 60000, lateralDirection: 'x', lateralType: 'wind', eccentricity: 0,
  holdDownStiffness: 15000, anchorageSlack: 0, crushCapacity: 60000, bandGa: 10000, bearingStiffness: 1e6,
  combination: 'unfactored', factors: [1, 1, 1, 1, 0, 0, 0, 0], deadFloor: 0.002, liveFloor: 0.0019, deadRoof: 0.001, snow: 0.002,
}

export interface BuildingPier { start: number; end: number; width: number }
/** Segmented-design piers, as Carapace finds them (stud-wall.md, Piers): each run of full-height studs between
 * openings, from its first to its last stud, with at least two studs. Studs strictly inside an opening are cripples. */
export function wallPiers(layout: WallLayoutSpec): BuildingPier[] {
  const openings = [...(layout.openings ?? [])].sort((a, b) => a.x0 - b.x0)
  const full = layout.studs.map((s) => s.x).filter((x) => !openings.some((o) => x > o.x0 && x < o.x1)).sort((a, b) => a - b)
  const runs: number[][] = [[]]
  for (const x of full) {
    const prev = runs.at(-1)!.at(-1)
    if (prev !== undefined && openings.some((o) => o.x0 >= prev && o.x1 <= x)) runs.push([])
    runs.at(-1)!.push(x)
  }
  return runs.filter((r) => r.length >= 2).map((r) => ({ start: r[0], end: r.at(-1)!, width: r.at(-1)! - r[0] }))
}

export const PIER_QUANTITIES: StudWallQuantity[] = ['q', 'gamma', 'momentBase', 'momentTop', 'chordLeft', 'chordRight']
export const WALL_BASE_COMPONENTS: StudWallBaseComponent[] = ['shear', 'axial', 'moment']
/** A stud wall's recorded columns, in order: its base reaction (shear, axial, moment), then each pier's quantities as `p<n>.<quantity>`.
 * The compiler records exactly this list per `studWall` element and the results table reads it back by label. */
export function studWallRecorders(layout: WallLayoutSpec, elementIndex: number): { labels: string[]; specs: RecorderSpecWire[] } {
  const labels: string[] = [], specs: RecorderSpecWire[] = []
  for (const component of WALL_BASE_COMPONENTS) { labels.push(component); specs.push({ response: 'studWallBase', elementKind: 'studWall', elementIndex, component }) }
  wallPiers(layout).forEach((_, pier) => PIER_QUANTITIES.forEach((quantity) => { labels.push(`p${pier + 1}.${quantity}`); specs.push({ response: 'studWallPier', elementKind: 'studWall', elementIndex, pier, quantity }) }))
  return { labels, specs }
}

function layout(p: StudBuildingParams, length: number, window: boolean): WallLayoutSpec {
  const L = length, H = p.wallHeight, spacing = p.studSpacing
  const E = 9500, studEA = E * 38 * 140
  const x0 = (L - p.windowWidth) / 2, x1 = (L + p.windowWidth) / 2
  const xs = new Set<number>([0, L])
  for (let x = spacing; x < L; x += spacing) xs.add(Math.round(x))
  if (window) { xs.add(x0); xs.add(x1) }
  const topEi = 2 * E * 140 * 38 ** 3 / 12
  return {
    length: L, height: H, studs: [...xs].sort((a, b) => a - b).map((x) => ({ x, ea: studEA * (x === 0 || x === L ? 3 : 1) })),
    topEa: 2 * studEA, topEi, topDistribution: 'beam', bottomEa: studEA, bottomEi: E * 140 * 38 ** 3 / 12,
    openings: window ? [{ x0, x1, headHeight: p.windowHead, headerEi: 2 * E * 38 * 235 ** 3 / 12, jackEa: studEA, door: false }] : [],
    sheathing: { law: p.sheathing === 'o86' ? { kind: 'o86', bv: 11000, nailSpacing: 150, nailDiameter: 3.25 } : { kind: 'linear', ga: 11000 } }, foundation: false,
  }
}

/** The template's `BuildingSpec` (Carapace's building generator input) and the resolved parameters. */
export function studBuildingSpec(params: Partial<StudBuildingParams> = {}): { spec: BuildingSpec; p: StudBuildingParams } {
  const p = { ...STUD_BUILDING_DEFAULTS, ...params }
  const wall = (name: string, start: [number, number], direction: [number, number], length: number, window = false): WallSpec => ({ name, start, direction, layout: layout(p, length, window), loads: [] })
  const anchorage = { tension: p.holdDownStiffness, slack: p.anchorageSlack, bearing: { kind: 'o86Crush' as const, qr: p.crushCapacity } }
  const withWindow = !p.noWindows && p.windowWidth > 0
  const walls = [wall('front', [0, 0], [1, 0], p.length, withWindow), wall('back', [0, p.width], [1, 0], p.length, withWindow), wall('left', [0, 0], [0, 1], p.width), wall('right', [p.length, 0], [0, 1], p.width)]
  const factors = p.factors.length === 8 ? p.factors : [1, 1, 1, 1, 0, 0, 0, 0]
  const storeys = Array.from({ length: p.storeys }, (_, i) => {
    const top = i === p.storeys - 1
    const weights = top ? [[0, p.deadRoof], [2, p.snow]] : [[0, p.deadFloor], [1, p.liveFloor]]
    const fx = p.lateralType === 'wind' ? 3 : 4
    // Storey forces at the top of each level's band, F_i proportional to h_i (equal storey weights).
    const levelHeights = Array.from({ length: p.storeys }, (_, level) => (p.wallHeight + p.floorDepth) * (level + 1))
    const force = p.lateralShear * levelHeights[i] / levelHeights.reduce((sum, h) => sum + h, 0)
    const eccentric = p.eccentricity / 100 * (p.lateralDirection === 'x' ? p.width : p.length)
    const at: [number, number] = p.lateralDirection === 'x' ? [p.length / 2, p.width / 2 + eccentric] : [p.length / 2 + eccentric, p.width / 2]
    return {
      wallHeight: p.wallHeight, floorDepth: p.floorDepth, bandGa: p.bandGa, rimEa: 9000 * 32 * p.floorDepth, anchorage, bearing: p.bearingStiffness, walls,
      floors: [{ bounds: [0, p.length, 0, p.width] as [number, number, number, number], supports: ['front', 'back'], spanAxis: 'z' as const, continuity: 'simple' as const, loads: weights.map(([slot, w]) => ({ kind: 'area' as const, slot, w })) }],
      lateral: [{ slot: fx, fx: p.lateralDirection === 'x' ? force : 0, fz: p.lateralDirection === 'z' ? force : 0, at }],
    }
  })
  return { spec: { storeys, foundationAnchorage: anchorage, diaphragm: p.diaphragm, combination: factors as [number, number, number, number, number, number, number, number] }, p }
}
