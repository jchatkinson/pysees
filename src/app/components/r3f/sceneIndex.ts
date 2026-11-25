import type { ElementEntity, GeomTransfEntity, NodeEntity } from '@/app/types/model'
import { memberFrame } from '@/app/lib/memberFrame'
import { shellFrame } from '@/app/lib/shells'
import { isShell } from '@/app/lib/commands/tables'
import { toVec3 } from './utils'
import { isStudWall, studWallArgs } from '@/app/lib/studWalls'
import { wallPiers } from '@/app/lib/studBuilding'
import { diaphragmArgs, diaphragmOutline, isDiaphragm } from '@/app/lib/diaphragms'
import { isJoistFloor } from '@/app/lib/floors'

/** A diaphragm's four corner nodes, counter-clockwise. */
function diaphragmCorners(el: ElementEntity): number[] {
  const { u, v } = diaphragmArgs(el.args).layout, nu = u.length, nv = v.length
  return [el.nodes[0], el.nodes[nu - 1], el.nodes[nu * nv - 1], el.nodes[nu * (nv - 1)]]
}

/** A stud wall's node ids around its outline: the bottom chord left to right (corner, stations, corner), then the top chord back. */
function wallOutline(el: ElementEntity): number[] {
  const stations = studWallArgs(el.args).stations ?? []
  const chord = (c: 'top' | 'bottom') => stations.map((s, i) => ({ x: s.x, id: el.nodes[4 + i] })).filter((_, i) => stations[i].chord === c).sort((a, b) => a.x - b.x).map((s) => s.id)
  return [el.nodes[0], ...chord('bottom'), el.nodes[1], el.nodes[2], ...chord('top').reverse(), el.nodes[3]]
}

/** Line segments each beam or truss span is split into (its displaced shape and diagrams are curved). Fixed so the line buffer
 * layout never changes between undeformed and displaced display — only the positions are rewritten. */
export const SEGMENTS_PER_SPAN = 8
/** Segments per span of an element kind: shell edges and the rest stay straight when displaced, so one each. */
export const segmentsFor = (kind: ElementKind) => (kind === 'beam' || kind === 'truss' ? SEGMENTS_PER_SPAN : 1)

/**
 * Stable, array-backed view of the model for the GPU buffers. Node row `i` / element row `j` are
 * positions in the sorted-by-id lists below; results data and instance buffers are indexed by them.
 */
/** `wall` is a Carapace stud wall: its closed outline through the corners and chord stations, filled like a shell; `diaphragm` a
 * flexible diaphragm's boundary through its edge grid nodes; `floor` a joist floor's plan polygon (any shape). */
export type ElementKind = 'beam' | 'truss' | 'shell' | 'wall' | 'diaphragm' | 'floor' | 'other'

export interface SceneIndex {
  /** Model dimension: 2D elements live in the XY plane. */
  ndm: 2 | 3
  nodeIds: number[]
  nodeIndex: Map<number, number>
  /** Undeformed xyz per node, `3 * nodeIds.length`. */
  nodeCoords: Float32Array
  /** Elements with at least two resolvable nodes. */
  elementIds: number[]
  /** Per element: node rows along the member, in element order. */
  elementNodes: number[][]
  /** Per element: beam-columns get cubic displaced shapes and N/V/M diagrams; trusses only axial; shells are closed polygons drawn as a surface; the rest interpolate linearly. */
  elementKind: ElementKind[]
  /** Per element, 9 floats: local x, y, z axes (global components) of its first span (a shell's e1, e2, e3); zeros for a zero-length element. */
  elementFrames: Float32Array
  segmentsPerSpan: number
  /** Per element: the spans it draws. A shell skips an edge an earlier element (a beam on it, or the neighbouring shell) already draws. */
  elementSpans: number[][]
  /** Per element: first segment index in the line buffer (`segmentsFor` its kind per span); `elementSegmentStart[elementIds.length]` is the total. */
  elementSegmentStart: Uint32Array
  segmentCount: number
  /** Stud-wall piers, which carry the wall's recorded forces (`p<pier>.<quantity>` columns): the wall's element row, its corner node rows
   * (bottom start, bottom end, top end, top start), the pier's ends as fractions of the wall length, its width (model length) and number. */
  wallPiers: { e: number; corners: [number, number, number, number]; u0: number; u1: number; width: number; pier: number }[]
  /** Stud walls, for member results: element row, corner rows, length, framing top as a fraction of the corner height (below a floor
   * zone), and each opening's edges and head (wall-local length). */
  studWalls: { e: number; corners: [number, number, number, number]; length: number; framing: number; height: number; openings: { x0: number; x1: number; head: number }[] }[]
}

/** Line spans of an element: a chain of `n - 1`, or for a shell the closed outline of `n`. */
export const isClosed = (kind: ElementKind) => kind === 'shell' || kind === 'wall' || kind === 'diaphragm' || kind === 'floor'
export const spanCount = (kind: ElementKind, nodeCount: number) => (isClosed(kind) ? nodeCount : nodeCount - 1)
/** The node rows at the ends of span `span`; a shell's last span closes back to its first node. */
export const spanEnds = (rows: number[], span: number): [number, number] => [rows[span], rows[(span + 1) % rows.length]]

export function buildSceneIndex(
  nodes: Map<number, NodeEntity>,
  elements: Map<number, ElementEntity>,
  geomTransfs: Map<number, GeomTransfEntity>,
  ndm: 2 | 3,
): SceneIndex {
  const sortedNodes = [...nodes.values()].sort((a, b) => a.id - b.id)
  const nodeIds = sortedNodes.map((n) => n.id)
  const nodeIndex = new Map(nodeIds.map((id, i) => [id, i]))
  const nodeCoords = new Float32Array(nodeIds.length * 3)
  sortedNodes.forEach((n, i) => nodeCoords.set(toVec3(n.coords), i * 3))

  const elementIds: number[] = []
  const elementNodes: number[][] = []
  const elementKind: ElementKind[] = []
  const frames: number[] = []
  const starts: number[] = []
  const spans: number[][] = []
  const drawn = new Set<number>()
  const edge = (a: number, b: number) => Math.min(a, b) * nodeIds.length + Math.max(a, b)
  let segmentCount = 0
  const wallPierList: SceneIndex['wallPiers'] = []
  const studWallList: SceneIndex['studWalls'] = []
  for (const el of [...elements.values()].sort((a, b) => a.id - b.id)) {
    const wall = isStudWall(el.eleType), diaphragm = isDiaphragm(el.eleType), floor = isJoistFloor(el.eleType)
    const outline = wall ? wallOutline(el) : diaphragm ? diaphragmOutline(el.nodes, diaphragmArgs(el.args).layout) : el.nodes
    const rows = outline.map((id) => nodeIndex.get(id)).filter((r): r is number => r !== undefined)
    if (rows.length < 2 || ((wall || diaphragm || floor || isShell(el.eleType)) && (rows.length !== outline.length || rows.length < 3))) continue
    const kind: ElementKind = wall ? 'wall' : diaphragm ? 'diaphragm' : floor ? 'floor' : isShell(el.eleType) ? 'shell' : /BeamColumn$/i.test(el.eleType) ? 'beam' : /^truss$/i.test(el.eleType) ? 'truss' : 'other'
    elementIds.push(el.id)
    elementNodes.push(rows)
    elementKind.push(kind)
    const shell = kind === 'wall' ? shellFrame([el.nodes[0], el.nodes[1], el.nodes[2], el.nodes[3]].map((id) => nodeIndex.get(id)!).map((r) => [nodeCoords[r * 3], nodeCoords[r * 3 + 1], nodeCoords[r * 3 + 2]])) : kind === 'diaphragm' ? shellFrame(diaphragmCorners(el).map((id) => nodeIndex.get(id)!).map((r) => [nodeCoords[r * 3], nodeCoords[r * 3 + 1], nodeCoords[r * 3 + 2]])) : kind === 'shell' ? shellFrame(rows.map((r) => [nodeCoords[r * 3], nodeCoords[r * 3 + 1], nodeCoords[r * 3 + 2]])) : null
    const frame = shell ? { x: shell.e1, y: shell.e2, z: shell.e3 } : isClosed(kind) ? null : memberFrame(nodeCoords.subarray(rows[0] * 3, rows[0] * 3 + 3), nodeCoords.subarray(rows[1] * 3, rows[1] * 3 + 3), ndm, geomTransfs.get(Number(el.args.transfTag))?.args.vecxz)
    frames.push(...(frame ? [...frame.x, ...frame.y, ...frame.z] : [0, 0, 0, 0, 0, 0, 0, 0, 0]))
    starts.push(segmentCount)
    const mine: number[] = []
    for (let span = 0; span < spanCount(kind, rows.length); span++) {
      const key = edge(...spanEnds(rows, span))
      if (kind === 'shell' && drawn.has(key)) continue
      drawn.add(key)
      mine.push(span)
    }
    spans.push(mine)
    if (wall) {
      const { layout } = studWallArgs(el.args)
      const corners = el.nodes.slice(0, 4).map((id) => nodeIndex.get(id)!) as [number, number, number, number]
      if (layout?.length > 0) {
        const c = (r: number) => [nodeCoords[r * 3], nodeCoords[r * 3 + 1], nodeCoords[r * 3 + 2]]
        const H = Math.hypot(...c(corners[3]).map((v, k) => v - c(corners[0])[k])) || layout.height
        studWallList.push({ e: elementIds.length - 1, corners, length: layout.length, framing: Math.min(1, layout.height / H), height: H, openings: (layout.openings ?? []).map((o) => ({ x0: o.x0, x1: o.x1, head: o.headHeight })) })
      }
      if (layout?.length > 0) wallPiers(layout).forEach((p, i) => wallPierList.push({ e: elementIds.length - 1, corners, u0: p.start / layout.length, u1: p.end / layout.length, width: p.width, pier: i + 1 }))
    }
    segmentCount += mine.length * segmentsFor(kind)
  }
  starts.push(segmentCount)

  return hideFromDevTools({ ndm, nodeIds, nodeIndex, nodeCoords, elementIds, elementNodes, elementKind, elementFrames: Float32Array.from(frames), elementSpans: spans, segmentsPerSpan: SEGMENTS_PER_SPAN, elementSegmentStart: Uint32Array.from(starts), segmentCount, wallPiers: wallPierList, studWalls: studWallList })
}

/**
 * Makes every own field of `target` non-enumerable (they read, write and type the same). React's development build logs a deep
 * diff of every changed prop for the browser's Performance panel, expanding arrays and typed arrays entry by entry: on a large
 * model the scene index and display buffers became millions of log rows and each view switch took ~10 s. Production builds
 * don't log at all.
 */
export function hideFromDevTools<T extends object>(target: T): T {
  for (const key of Object.keys(target)) Object.defineProperty(target, key, { enumerable: false })
  return target
}

/**
 * Write every element's segments into `out` (6 floats per segment: start xyz, end xyz) from the
 * given per-node positions. Spans are straight today; displaced shapes replace the lerp with a
 * Hermite sample at the same stations.
 */
export function fillSegmentPositions(index: SceneIndex, nodePositions: Float32Array, out: Float32Array): void {
  let o = 0
  index.elementNodes.forEach((rows, e) => {
    for (const span of index.elementSpans[e]) {
      const [ra, rb] = spanEnds(rows, span)
      const a = ra * 3
      const b = rb * 3
      const n = segmentsFor(index.elementKind[e])
      for (let s = 0; s < n; s++) {
        const t0 = s / n
        const t1 = (s + 1) / n
        for (let k = 0; k < 3; k++) {
          const pa = nodePositions[a + k]
          const d = nodePositions[b + k] - pa
          out[o + k] = pa + d * t0
          out[o + 3 + k] = pa + d * t1
        }
        o += 6
      }
    }
  })
}
