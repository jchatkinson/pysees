import type { Expansion, CarapaceInputV1 as WasmInput, FloorTransferSpec, MaterialSpec, StudWallSpec, WallChordSpec, WallLayoutSpec, WallShearLawSpec } from '@/app/carapace/wasm/carapace_wasm'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import type { ElementEntity, Model, StudBuildingParams } from '@/app/types/model'
import { studBuildingSpec, wallPiers } from '@/app/lib/studBuilding'
import { ModelDraft } from '@/app/lib/modelWrite'
import { wallLoadArgs } from '@/app/lib/shells'
import { applyFraming, guessFraming, lumberScale, type WallFraming } from '@/app/lib/lumber'
import type { FloorAreaLoadArgs, JoistFloorArgs } from '@/app/lib/floors'

/** A `studWall` element's args: its layout and, for each node after the four corners, the chord and wall-local x of that station. */
export interface StudWallArgs { label?: string; layout: WallLayoutSpec; stations: { chord: WallChordSpec; x: number }[]; /** Members as lumber (PySees only; the layout's EA / EI are computed from it). */ framing?: WallFraming }
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
    let dofs = eq.dofs.filter(([i]) => i === row).map(([, d]) => d + 1)
    // A wall's bottom sits on the floor below: tie both plan translations, not just the one along the wall. The other has no stiffness
    // in the wall, so the results don't change, but untied Carapace leaves it at zero and the deformed wall's base stays behind.
    if (dofs.length === 1 && (dofs[0] === 1 || dofs[0] === 2)) dofs = [1, 2]
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
  const el = input.elementLoads
  el?.pattern.forEach((pat, i) => {
    const load = el.load[i]
    if (load.kind !== 'wallLoad' || el.elementKind[i] !== 'studWall') return
    writes.push({ kind: 'patternChild', patternId: pat + 1, child: { kind: 'eleLoad', args: wallLoadArgs([wallId(el.elementIndex[i])], load.load) } })
  })
  // Floors: one joist floor per set of bearing walls (a storey's floor), its outline the hull of those walls' top corners (their own
  // nodes), joists square to the walls; each pattern's area loads become a floor load on it. Anything else stays an explicit row.
  const floorIds = new Map<string, number>()
  let nextFloor = zlBase + (z?.nodeI.length ?? 0)
  for (const f of input.floorLoads ?? []) {
    const { pattern, supports, ...rest } = f
    const walls = [...new Set(supports.map((s) => s.wall.index))].sort((a, b) => a - b)
    const tops = walls.flatMap((row) => { const c = input.studWalls?.[row]?.corners; return c ? [c[3], c[2]] : [] })
    if (rest.loads.every((l) => l.kind === 'area' && !l.region) && tops.length >= 4) {
      const key = walls.join(',')
      let id = floorIds.get(key)
      if (id === undefined) {
        id = nextFloor++
        floorIds.set(key, id)
        const pt = (i: number) => [coords[3 * i], coords[3 * i + 1]]
        const [a, b] = [pt(tops[0]), pt(tops[1])]
        const angle = Number(((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90).toFixed(9))
        const level = map.storeys.findIndex((st) => st.walls.some((w) => walls.includes(w.element)))
        const args: JoistFloorArgs = { label: `S${level + 1} floor`, angle, spacing: p.studSpacing, joist: { grade: 'o86-spf', size: '2x10', plies: 1 }, continuity: rest.continuity, subfloor: Math.max(0, p.floorDepth - 235) }
        writes.push({ kind: 'element', entity: { id, eleType: 'joistFloor', nodes: convexHull([...new Set(tops)], pt).map(nodeId), args: args as unknown as Record<string, unknown> } })
      }
      const load: FloorAreaLoadArgs = { floor: id, loads: rest.loads.map((l) => ({ kind: 'area' as const, w: (l as { w: number }).w })) }
      writes.push({ kind: 'patternChild', patternId: pattern + 1, child: { kind: 'floorLoad', args: load as unknown as Record<string, unknown> } })
      continue
    }
    const args: FloorLoadArgs = { ...rest, supports: supports.map((s) => ({ ...s, wall: wallId(s.wall.index) })) }
    writes.push({ kind: 'patternChild', patternId: pattern + 1, child: { kind: 'floorLoad', args: args as unknown as Record<string, unknown> } })
  }

  // Record the whole model (displacements, reactions, element forces) as every template does, so the run has results to show.
  const analysisCommands: AnalysisCommand[] = [{ type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } }, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: patternIds, steps: p.steps, holdLoads: 'Yes', algorithm: 'Newton', tol: 1e-7, maxIter: 100 } }]
  const storey = p.wallHeight + p.floorDepth
  const levels: LevelEntity[] = Array.from({ length: p.storeys }, (_, i) => ({ id: i + 1, label: i === p.storeys - 1 ? 'Roof' : `Floor ${i + 2}`, height: storey * (i + 1) }))
  const gridlines: GridlineEntity[] = [
    { id: 1, label: 'A', start: [0, 0], end: [p.length, 0] }, { id: 2, label: 'B', start: [0, p.width], end: [p.length, p.width] },
    { id: 3, label: '1', start: [0, 0], end: [0, p.width] }, { id: 4, label: '2', start: [p.length, 0], end: [p.length, p.width] },
  ]
  return { writes, analysisCommands, levels, gridlines }
}

/** Indices of the convex hull of `ids` (by their plan point), counter-clockwise. */
function convexHull(ids: number[], pt: (i: number) => number[]): number[] {
  const sorted = [...ids].sort((a, b) => pt(a)[0] - pt(b)[0] || pt(a)[1] - pt(b)[1])
  const cross = (o: number, a: number, b: number) => (pt(a)[0] - pt(o)[0]) * (pt(b)[1] - pt(o)[1]) - (pt(a)[1] - pt(o)[1]) * (pt(b)[0] - pt(o)[0])
  const half = (list: number[]) => { const h: number[] = []; for (const i of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], i) <= 0) h.pop(); h.push(i) } h.pop(); return h }
  return [...half(sorted), ...half([...sorted].reverse())]
}

// ── Editing a wall ───────────────────────────────────────────────────────────

type V3 = [number, number, number]
const xyz = (c: number[]): V3 => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]

/** A wall's frame from its corner nodes: origin c0, unit x (c0→c1), unit y (c0→c3), length and top height (to the exterior top row). */
export function studWallFrame(model: Model, e: ElementEntity): { o: V3; ex: V3; ey: V3; L: number; H: number } | null {
  const c = e.nodes.slice(0, 4).map((id) => model.nodes.get(id)?.coords)
  if (c.length < 4 || c.some((p) => !p)) return null
  const [p0, p1, , p3] = c.map((p) => xyz(p!))
  const dx = p1.map((v, k) => v - p0[k]), dy = p3.map((v, k) => v - p0[k])
  const L = Math.hypot(...dx), H = Math.hypot(...dy)
  return L > 0 && H > 0 ? { o: p0, ex: dx.map((v) => v / L) as V3, ey: dy.map((v) => v / H) as V3, L, H } : null
}

/** Pier ends (the king studs either side of every full-height run), where hold-downs go. */
export const pierEnds = (layout: WallLayoutSpec) => wallPiers(layout).flatMap((p) => [p.start, p.end])

/** Whether a node is used by anything other than the given element: another element, a constraint, a support, a mass or a nodal load. */
function usedElsewhere(model: Model, node: number, except: number): boolean {
  for (const e of model.elements.values()) if (e.id !== except && e.nodes.includes(node)) return true
  for (const c of model.mpConstraints.values()) {
    const a = c.args
    if (Number(a.rNodeTag) === node || Number(a.cNodeTag) === node || ((a.cNodeTags as number[] | undefined) ?? []).map(Number).includes(node)) return true
  }
  if (model.fixes.has(node) || model.masses.has(node)) return true
  for (const p of model.patterns.values()) for (const ch of p.children) if (ch.kind !== 'eleLoad' && ch.kind !== 'floorLoad' && Number(ch.args.nodeTag) === node) return true
  return false
}

/** Layout problems Carapace would reject, in words (empty when the layout is usable for a wall of length `L`). */
export function studWallLayoutProblems(layout: WallLayoutSpec, L: number): string[] {
  const out: string[] = []
  const tol = 1e-9 * L
  const xs = layout.studs.map((s) => s.x)
  if (xs.some((x) => x < -tol || x > L + tol)) out.push('Every stud must lie on the wall (0 ≤ x ≤ length).')
  if (!xs.some((x) => Math.abs(x) <= tol) || !xs.some((x) => Math.abs(x - L) <= tol)) out.push('The wall needs end studs at x = 0 and x = length.')
  if (layout.studs.some((s) => !(s.ea > 0))) out.push('Stud EA must be positive.')
  for (const o of layout.openings ?? []) {
    if (!(o.x0 < o.x1) || o.x0 < -tol || o.x1 > L + tol) out.push(`Opening ${o.x0}–${o.x1} must have x0 < x1 within the wall.`)
    if (!(o.headHeight > 0) || o.headHeight > layout.height) out.push(`Opening ${o.x0}–${o.x1}: the head must be above the base and no higher than the framing.`)
    if (![o.x0, o.x1].every((x) => xs.some((s) => Math.abs(s - x) <= tol))) out.push(`Opening ${o.x0}–${o.x1} needs studs at both edges.`)
  }
  const open = [...(layout.openings ?? [])].sort((a, b) => a.x0 - b.x0)
  for (let i = 0; i + 1 < open.length; i++) if (open[i + 1].x0 < open[i].x1 - tol) out.push('Openings must not overlap.')
  if (!wallPiers(layout).length) out.push('The wall has no full-height pier (two full-height studs not separated by an opening).')
  const law = layout.sheathing?.law
  if (law?.kind === 'linear' && !(law.ga > 0)) out.push('Sheathing Ga must be positive.')
  if (law?.kind === 'o86' && !(law.bv > 0 && law.nailSpacing > 0 && law.nailDiameter > 0)) out.push('O86 sheathing needs positive Bv, nail spacing and nail diameter.')
  return out
}

/**
 * Give a wall a new layout (same length and heights) and rebuild its chord stations: the top row has a station at every stud and pier end,
 * the bottom chord one at every pier end plus any existing bottom station something else still uses (a link to the wall below).
 * Stations at an unchanged x keep their node; new ones get new nodes (never merged with a neighbour's coincident node); dropped station
 * nodes are deleted unless something else uses them (`kept`). New pier ends get no hold-down (see `unanchoredPierEnds`).
 */
export function rebuildStudWall(model: Model, id: number, layout: WallLayoutSpec, framing?: WallFraming): { model: Model; kept: number[]; added: number[] } {
  const e = model.elements.get(id)
  const f = e && studWallFrame(model, e)
  if (!e || !f) return { model, kept: [], added: [] }
  const a = studWallArgs(e.args)
  const L = f.L, tol = 1e-9 * L
  const inner = (xs: number[]) => [...xs].sort((p, q) => p - q).filter((x, i, s) => x > tol && x < L - tol && (i === 0 || x - s[i - 1] > tol))
  const old = a.stations.map((s, i) => ({ ...s, node: e.nodes[4 + i] }))
  const tops = inner([...layout.studs.map((s) => s.x), ...pierEnds(layout)])
  const bottoms = inner([...pierEnds(layout), ...old.filter((s) => s.chord === 'bottom' && usedElsewhere(model, s.node, id)).map((s) => s.x)])
  const draft = new ModelDraft(model)
  let m = model
  const added: number[] = []
  const stationNode = (chord: WallChordSpec, x: number) => {
    const hit = old.find((s) => s.chord === chord && Math.abs(s.x - x) <= tol)
    if (hit) return hit.node
    const node = m.nextIds.node
    const y = chord === 'top' ? f.H : 0
    m = draft.apply({ kind: 'node', entity: { id: node, coords: [0, 1, 2].slice(0, model.config?.ndm ?? 3).map((k) => Number((f.o[k] + f.ex[k] * x + f.ey[k] * y).toPrecision(12))) } }).model
    added.push(node)
    return node
  }
  const stations = [...tops.map((x) => ({ chord: 'top' as const, x })), ...bottoms.map((x) => ({ chord: 'bottom' as const, x }))]
  const nodes = [...e.nodes.slice(0, 4), ...stations.map((s) => stationNode(s.chord, s.x))]
  const args: StudWallArgs = { ...a, layout, stations, ...(framing ? { framing } : {}) }
  m = draft.apply({ kind: 'element', entity: { ...e, nodes, args: args as unknown as Record<string, unknown> } }).model
  const kept: number[] = []
  for (const s of old) {
    if (nodes.includes(s.node)) continue
    if (usedElsewhere(m, s.node, id)) { kept.push(s.node); continue }
    const next = new Map(m.nodes); next.delete(s.node); m = { ...m, nodes: next }
  }
  return { model: m, kept, added }
}

/** Pier ends of a wall with no hold-down: the bottom node there (a corner or a station) is used by nothing but the wall, so uplift is free. */
export function unanchoredPierEnds(model: Model, e: ElementEntity): number[] {
  const f = studWallFrame(model, e)
  if (!f) return []
  const a = studWallArgs(e.args), tol = 1e-9 * f.L
  const bottomAt = (x: number) => (Math.abs(x) <= tol ? e.nodes[0] : Math.abs(x - f.L) <= tol ? e.nodes[1] : e.nodes[4 + a.stations.findIndex((s) => s.chord === 'bottom' && Math.abs(s.x - x) <= tol)])
  return pierEnds(a.layout).filter((x) => { const n = bottomAt(x); return n === undefined || !usedElsewhere(model, n, e.id) })
}

// ── Drawing walls ────────────────────────────────────────────────────────────

/** A linear `Anchorage` (no slack) with this tension and bearing stiffness: an identical existing one, else a new one written to `batch`. */
export function holdDownMaterial(batch: { model: Model; writeRaw: (w: ModelWrite) => void }, h: { tension: number; k: number }): number {
  const found = [...batch.model.materials.values()].find((m) => m.matType === 'Anchorage' && m.args.tension === h.tension && Number(m.args.slack ?? 0) === 0 && m.args.bearing === 'linear' && m.args.k === h.k)
  if (found) return found.id
  const id = batch.model.nextIds.material
  batch.writeRaw({ kind: 'material', entity: { id, kind: 'uniaxial', matType: 'Anchorage', args: { matTag: id, matType: 'Anchorage', tension: h.tension, slack: 0, bearing: 'linear', k: h.k }, usage: 'force-deformation' } })
  return id
}

/** What the wall tool draws: a layout recipe (regular studs from the start corner) plus the hold-down material at pier ends. */
export interface StudWallTemplate {
  spacing: number; studEa: number; endEa: number
  topEa: number; topEi?: number; topDistribution: 'beam' | 'direct'; bottomEa: number; bottomEi: number
  law: WallShearLawSpec
  /** Floor zone at the top (depth taken out of the storey height), or none. */
  floor?: { depth: number; ga: number; rimEa: number }
  /** `Anchorage` material id for hold-downs at pier ends; none leaves them unanchored (unless `holdDown` is set). */
  anchorage?: number
  /** A linear hold-down to use when `anchorage` isn't set: the first wall drawn makes the `Anchorage` material (or reuses an identical one). */
  holdDown?: { tension: number; k: number }
  /** Members as lumber (no openings); when set, a drawn wall's EAs come from it. */
  framing?: WallFraming
}

/** A wall's recipe, for drawing more like it: its most common stud spacing, its EAs, chords, sheathing, floor zone and hold-down material. */
export function studWallTemplateOf(model: Model, e: ElementEntity): StudWallTemplate | null {
  const l = studWallArgs(e.args).layout
  if (!l?.studs.length) return null
  const xs = l.studs.map((s) => s.x).sort((a, b) => a - b)
  const gaps = xs.slice(1).map((x, i) => Number((x - xs[i]).toPrecision(9)))
  const spacing = [...gaps.reduce((m, g) => m.set(g, (m.get(g) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? l.length
  const interior = l.studs.filter((s) => s.x > 0 && s.x < l.length)
  const studEa = [...interior.reduce((m, s) => m.set(s.ea, (m.get(s.ea) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? l.studs[0].ea
  // The hold-down: an Anchorage material on a zero-length at one of the wall's bottom nodes.
  let anchorage: number | undefined
  for (const z of model.elements.values()) {
    if (z.eleType !== 'zeroLength' || !z.nodes.some((n) => n === e.nodes[0] || n === e.nodes[1])) continue
    anchorage = ((z.args.mat as number[] | undefined) ?? []).map(Number).find((m) => model.materials.get(m)?.matType === 'Anchorage')
    if (anchorage !== undefined) break
  }
  return {
    spacing, studEa, endEa: l.studs.find((s) => s.x === 0)?.ea ?? studEa, topEa: l.topEa, topEi: l.topEi, topDistribution: l.topDistribution, bottomEa: l.bottomEa, bottomEi: l.bottomEi,
    law: l.sheathing?.law ?? { kind: 'linear', ga: 1 }, floor: l.floor ? { ...l.floor } : undefined, anchorage,
    framing: { ...(studWallArgs(e.args).framing ?? guessFraming(l, lumberScale(model.config?.units, l.height), model.config?.units ? !['in', 'ft'].includes(model.config.units.length) : true)), openings: [] },
  }
}

/** A plain layout (no openings) for a wall `length` long with `height` of framing: studs from the start corner at the template's spacing. */
export function templateLayout(t: StudWallTemplate, length: number, height: number): WallLayoutSpec {
  const xs = [0]
  for (let x = t.spacing; x < length - 1e-6 * length; x += t.spacing) xs.push(Number(x.toPrecision(12)))
  xs.push(length)
  return {
    length, height, studs: xs.map((x) => ({ x, ea: x === 0 || x === length ? t.endEa : t.studEa })), topEa: t.topEa, topEi: t.topEi, topDistribution: t.topDistribution,
    bottomEa: t.bottomEa, bottomEi: t.bottomEi, openings: [], sheathing: { law: t.law }, foundation: false, ...(t.floor ? { floor: { ...t.floor } } : {}),
  }
}

/**
 * Draw one stud wall in plan from `a` to `b` (z ignored), spanning `z0` to `z1`: its own corner and station nodes (walls never share nodes;
 * they are joined by links), and at each pier end a hold-down: to the top node of a stud wall right below (a zero-length with the anchorage
 * material vertically and an equalDOF along the wall, as Carapace's building expansion does) or, on the lowest level, to a new fixed ground
 * node (anchorage vertically, stiff elastic in plan). Returns the wall's id, or null when it has no length or height.
 */
export function drawStudWall(batch: { model: Model; writeRaw: (w: ModelWrite) => void }, a: number[], b: number[], z0: number, z1: number, t: StudWallTemplate, label?: string): number | null {
  const dx = b[0] - a[0], dy = (b[1] ?? 0) - (a[1] ?? 0), L = Number(Math.hypot(dx, dy).toPrecision(12)), Htop = z1 - z0
  const depth = t.floor?.depth ?? 0
  if (!(L > 0) || !(Htop - depth > 0)) return null
  const ex = [dx / L, dy / L]
  const plain = templateLayout(t, L, Htop - depth)
  const layout = t.framing ? applyFraming(plain, t.framing, lumberScale(batch.model.config?.units, Htop)) : plain
  const at = (x: number, z: number) => [a[0] + ex[0] * x, (a[1] ?? 0) + ex[1] * x, z].map((v) => Number(v.toPrecision(12)))
  const newNode = (p: number[]) => { const id = batch.model.nextIds.node; batch.writeRaw({ kind: 'node', entity: { id, coords: p } }); return id }
  // Top nodes of existing walls (and their planes), looked up before this wall adds its own.
  const tol = 1e-6 * Math.max(1, L, Math.abs(z1))
  const tops: { node: number; p: number[] }[] = []
  for (const w of batch.model.elements.values()) {
    if (!isStudWall(w.eleType)) continue
    const wa = studWallArgs(w.args)
    const ids = [w.nodes[2], w.nodes[3], ...wa.stations.flatMap((s, i) => (s.chord === 'top' ? [w.nodes[4 + i]] : []))]
    for (const id of ids) { const c = batch.model.nodes.get(id)?.coords; if (c) tops.push({ node: id, p: c }) }
  }
  const lowest = Math.min(z0, ...[...batch.model.nodes.values()].map((n) => n.coords[2] ?? 0))
  const corners = [newNode(at(0, z0)), newNode(at(L, z0)), newNode(at(L, z1)), newNode(at(0, z1))]
  const inner = (xs: number[]) => [...new Set(xs)].sort((p, q) => p - q).filter((x) => x > 1e-9 * L && x < L - 1e-9 * L)
  const ends = pierEnds(layout)
  const stations = [...inner([...layout.studs.map((s) => s.x), ...ends]).map((x) => ({ chord: 'top' as const, x })), ...inner(ends).map((x) => ({ chord: 'bottom' as const, x }))]
  const stationNodes = stations.map((s) => newNode(at(s.x, s.chord === 'top' ? z1 : z0)))
  const id = batch.model.nextIds.element
  const args: StudWallArgs = { ...(label ? { label } : {}), layout, stations, ...(t.framing ? { framing: { ...t.framing, openings: [] } } : {}) }
  batch.writeRaw({ kind: 'element', entity: { id, eleType: 'studWall', nodes: [...corners, ...stationNodes], args: args as unknown as Record<string, unknown> } })
  const anchorage = t.anchorage ?? (t.holdDown && holdDownMaterial(batch, t.holdDown))
  if (anchorage === undefined || !batch.model.materials.has(anchorage)) return id
  const bottomAt = (x: number) => (x <= 1e-9 * L ? corners[0] : x >= L - 1e-9 * L ? corners[1] : stationNodes[stations.findIndex((s) => s.chord === 'bottom' && Math.abs(s.x - x) <= 1e-9 * L)])
  const planDofs = [1, 2] // both plan translations: the wall's base moves with the floor (see expansionToModel)
  let stiff: number | undefined
  for (const x of ends) {
    const node = bottomAt(x), p = at(x, z0)
    const below = tops.find((q) => q.p.every((v, k) => Math.abs(v - (p[k] ?? 0)) <= tol))
    if (below) {
      batch.writeRaw({ kind: 'element', entity: { id: batch.model.nextIds.element, eleType: 'zeroLength', nodes: [below.node, node], args: { mat: [anchorage], dir: [3] } } })
      batch.writeRaw({ kind: 'mpConstraint', entity: { id: batch.model.nextIds.mpConstraint, kind: 'equalDOF', args: { rNodeTag: below.node, cNodeTag: node, dofs: planDofs } } })
    } else if (z0 <= lowest + tol) {
      if (stiff === undefined) {
        stiff = [...batch.model.materials.values()].find((m) => m.matType === 'Elastic' && Number(m.args.e ?? m.args.E) === 1e12)?.id
        if (stiff === undefined) { stiff = batch.model.nextIds.material; batch.writeRaw({ kind: 'material', entity: { id: stiff, kind: 'uniaxial', matType: 'Elastic', args: { matTag: stiff, matType: 'Elastic', e: 1e12 }, usage: 'force-deformation' } }) }
      }
      const ground = newNode(p)
      batch.writeRaw({ kind: 'fix', entity: { nodeId: ground, dofs: [1, 2, 3, 4, 5, 6] } })
      batch.writeRaw({ kind: 'element', entity: { id: batch.model.nextIds.element, eleType: 'zeroLength', nodes: [ground, node], args: { mat: [stiff, stiff, anchorage], dir: [1, 2, 3] } } })
    }
  }
  return id
}
