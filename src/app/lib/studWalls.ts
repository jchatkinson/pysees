import type { Expansion, CarapaceInputV1 as WasmInput, FloorTransferSpec, MaterialSpec, StudWallSpec, WallChordSpec, WallLayoutSpec } from '@/app/carapace/wasm/carapace_wasm'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import type { StudBuildingParams } from '@/app/types/model'
import { studBuildingSpec } from '@/app/lib/studBuilding'

/** A `studWall` element's args: its layout and, for each node after the four corners, the chord and wall-local x of that station. */
export interface StudWallArgs { label?: string; layout: WallLayoutSpec; stations: { chord: WallChordSpec; x: number }[] }
/** A `floorLoad` pattern child: a one-way floor whose reactions load its support walls (Carapace's `floorLoads` row, walls by element id). */
export interface FloorLoadArgs extends Omit<FloorTransferSpec, 'pattern' | 'supports'> { supports: (Omit<FloorTransferSpec['supports'][number], 'wall'> & { wall: number })[] }

export const isStudWall = (eleType: string) => eleType === 'studWall'
export const studWallArgs = (args: Record<string, unknown>) => args as unknown as StudWallArgs

const SLOT_NAMES = ['Dead', 'Live', 'Snow', 'Wind', 'Earthquake', 'Slot 6', 'Slot 7', 'Slot 8']

/** Anchorage → PySees material args (Carapace-only `Anchorage`); everything else Carapace's expansion emits is a plain `Elastic`. */
function materialArgs(m: MaterialSpec): { matType: string; args: Record<string, unknown> } {
  if (m.kind === 'elastic') return { matType: 'Elastic', args: { e: m.e } }
  if (m.kind === 'anchorage') return { matType: 'Anchorage', args: { tension: m.tension, slack: m.slack, bearing: m.bearing.kind, ...(m.bearing.kind === 'linear' ? { k: m.bearing.k } : { qr: m.bearing.qr }) } }
  throw new Error(`The building expansion produced a ${m.kind} material, which PySees cannot hold yet`)
}

/** The stud-wall template: Carapace expands the building, and every generated table becomes an ordinary PySees entity
 * (nodes, supports, walls, anchorage zero-lengths, equalDOF / rigidDiaphragm constraints, patterns with nodal and floor loads)
 * plus one static stage over every pattern. After this the model is the user's to edit. */
export function studBuildingModel(expand: (spec: unknown, up: 'z') => Expansion, params: Partial<StudBuildingParams> = {}) {
  const { spec, p } = studBuildingSpec(params)
  const { input, map } = expand(spec, 'z')
  return { ...expansionToModel(input, map, p), params: p }
}

export function expansionToModel(input: WasmInput, map: Expansion['map'], p: StudBuildingParams): { writes: ModelWrite[]; analysisCommands: AnalysisCommand[]; levels: LevelEntity[]; gridlines: GridlineEntity[] } {
  const writes: ModelWrite[] = []
  const nodeId = (index: number) => index + 1
  const coords = input.nodes?.coords ?? [], fixed = input.nodes?.fixed ?? []
  for (let i = 0; i < coords.length / 3; i++) {
    // 12 significant digits: the expansion's floating noise (2693.999999999995) would put a diaphragm master off its floor plane for OpenSees.
    writes.push({ kind: 'node', entity: { id: nodeId(i), coords: [coords[3 * i], coords[3 * i + 1], coords[3 * i + 2]].map((v) => Number(v.toPrecision(12))) } })
    const mask = fixed[i] ?? 0
    const dofs = [0, 1, 2, 3, 4, 5].filter((d) => mask & (1 << d)).map((d) => d + 1)
    if (dofs.length) writes.push({ kind: 'fix', entity: { nodeId: nodeId(i), dofs } })
  }
  ;(input.materials ?? []).forEach((m, i) => {
    const { matType, args } = materialArgs(m)
    writes.push({ kind: 'material', entity: { id: i + 1, kind: 'uniaxial', matType, args: { matTag: i + 1, matType, ...args }, usage: 'force-deformation' } })
  })

  // Walls first (element id = studWalls row + 1), then the anchorage / link zero-lengths.
  const wallId = (row: number) => row + 1
  const wallLabels = new Map<number, string>()
  map.storeys.forEach((storey, si) => storey.walls.forEach((w) => wallLabels.set(w.element, `S${si + 1} ${w.name}`)))
  ;(input.studWalls ?? []).forEach((w: StudWallSpec, row) => {
    const args: StudWallArgs = { label: wallLabels.get(row), layout: w.layout, stations: w.stations.map(({ chord, x }) => ({ chord, x })) }
    writes.push({ kind: 'element', entity: { id: wallId(row), eleType: 'studWall', nodes: [...w.corners, ...w.stations.map((s) => s.node)].map(nodeId), args: args as unknown as Record<string, unknown> } })
  })
  const z = input.zeroLengths
  const zlBase = (input.studWalls?.length ?? 0) + 1
  z?.nodeI.forEach((ni, row) => {
    const mats = z.materials.filter(([r]) => r === row)
    writes.push({ kind: 'element', entity: { id: zlBase + row, eleType: 'zeroLength', nodes: [nodeId(ni), nodeId(z.nodeJ[row])], args: { mat: mats.map(([, , m]) => m + 1), dir: mats.map(([, d]) => d + 1) } } })
  })

  let mpId = 0
  const eq = input.equalDofs
  eq?.retained.forEach((r, row) => {
    const dofs = eq.dofs.filter(([i]) => i === row).map(([, d]) => d + 1)
    writes.push({ kind: 'mpConstraint', entity: { id: ++mpId, kind: 'equalDOF', args: { rNodeTag: nodeId(r), cNodeTag: nodeId(eq.constrained[row]), dofs } } })
  })
  const rd = input.rigidDiaphragms
  rd?.retained.forEach((r, row) => {
    const perpDirn = ({ x: 1, y: 2, z: 3 } as const)[rd.normal?.[row] ?? 'z']
    writes.push({ kind: 'mpConstraint', entity: { id: ++mpId, kind: 'rigidDiaphragm', args: { perpDirn, rNodeTag: nodeId(r), cNodeTags: rd.constrained.filter(([i]) => i === row).map(([, n]) => nodeId(n)) } } })
  })

  // One pattern per load slot the building uses, named for the slot, with the combination factor as its scale.
  const patternIds: number[] = []
  map.slotPatterns.forEach((row, slot) => {
    if (row === undefined || row === null) return
    const id = row + 1
    patternIds.push(id)
    writes.push({ kind: 'timeSeries', entity: { id, tsType: 'Linear', args: { type: 'Linear', tag: id, factor: 1 } } })
    writes.push({ kind: 'pattern', entity: { id, name: SLOT_NAMES[slot], patternType: 'Plain', args: { type: 'Plain', patternTag: id, tsTag: id, fact: input.loadPatterns?.scaleFactor[row] ?? 1 }, children: [] } })
  })
  const loads = input.nodalLoads ?? { pattern: [], node: [], dof: [], value: [], stage: [] }
  const nodal = new Map<string, { pattern: number; node: number; values: number[] }>()
  loads.pattern.forEach((pat, i) => {
    const key = `${pat}:${loads.node[i]}`
    const entry = nodal.get(key) ?? { pattern: pat + 1, node: nodeId(loads.node[i]), values: [0, 0, 0, 0, 0, 0] }
    entry.values[loads.dof[i]] += loads.value[i]
    nodal.set(key, entry)
  })
  for (const { pattern, node, values } of nodal.values()) writes.push({ kind: 'patternChild', patternId: pattern, child: { kind: 'load', args: { nodeTag: node, values } } })
  for (const f of input.floorLoads ?? []) {
    const { pattern, supports, ...rest } = f
    const args: FloorLoadArgs = { ...rest, supports: supports.map((s) => ({ ...s, wall: wallId(s.wall.index) })) }
    writes.push({ kind: 'patternChild', patternId: pattern + 1, child: { kind: 'floorLoad', args: args as unknown as Record<string, unknown> } })
  }

  const analysisCommands: AnalysisCommand[] = [{ type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: patternIds, steps: p.steps, holdLoads: 'Yes', algorithm: 'Newton', tol: 1e-7, maxIter: 100 } }]
  const storey = p.wallHeight + p.floorDepth
  const levels: LevelEntity[] = Array.from({ length: p.storeys }, (_, i) => ({ id: i + 1, label: i === p.storeys - 1 ? 'Roof' : `Floor ${i + 2}`, height: storey * (i + 1) }))
  const gridlines: GridlineEntity[] = [
    { id: 1, label: 'A', start: [0, 0], end: [p.length, 0] }, { id: 2, label: 'B', start: [0, p.width], end: [p.length, p.width] },
    { id: 3, label: '1', start: [0, 0], end: [0, p.width] }, { id: 4, label: '2', start: [p.length, 0], end: [p.length, p.width] },
  ]
  return { writes, analysisCommands, levels, gridlines }
}
