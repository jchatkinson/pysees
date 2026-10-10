import type { ElementEntity, GeomTransfEntity, NodeEntity } from '@/app/types/model'
import { memberFrame } from '@/app/lib/memberFrame'
import { shellFrame } from '@/app/lib/shells'
import { isShell } from '@/app/lib/commands/tables'
import { toVec3 } from './utils'

/** Line segments each element span is split into. Fixed so the line buffer layout never changes
 * between undeformed and displaced display — only the positions are rewritten. */
export const SEGMENTS_PER_SPAN = 8

/**
 * Stable, array-backed view of the model for the GPU buffers. Node row `i` / element row `j` are
 * positions in the sorted-by-id lists below; results data and instance buffers are indexed by them.
 */
export type ElementKind = 'beam' | 'truss' | 'shell' | 'other'

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
  /** Per element: first segment index in the line buffer; `elementSegmentStart[elementIds.length]` is the total. */
  elementSegmentStart: Uint32Array
  segmentCount: number
}

/** Line spans of an element: a chain of `n - 1`, or for a shell the closed outline of `n`. */
export const spanCount = (kind: ElementKind, nodeCount: number) => (kind === 'shell' ? nodeCount : nodeCount - 1)
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
  let segmentCount = 0
  for (const el of [...elements.values()].sort((a, b) => a.id - b.id)) {
    const rows = el.nodes.map((id) => nodeIndex.get(id)).filter((r): r is number => r !== undefined)
    if (rows.length < 2 || (isShell(el.eleType) && (rows.length !== el.nodes.length || rows.length < 3))) continue
    const kind: ElementKind = isShell(el.eleType) ? 'shell' : /BeamColumn$/i.test(el.eleType) ? 'beam' : /^truss$/i.test(el.eleType) ? 'truss' : 'other'
    elementIds.push(el.id)
    elementNodes.push(rows)
    elementKind.push(kind)
    const shell = kind === 'shell' ? shellFrame(rows.map((r) => [nodeCoords[r * 3], nodeCoords[r * 3 + 1], nodeCoords[r * 3 + 2]])) : null
    const frame = shell ? { x: shell.e1, y: shell.e2, z: shell.e3 } : kind === 'shell' ? null : memberFrame(nodeCoords.subarray(rows[0] * 3, rows[0] * 3 + 3), nodeCoords.subarray(rows[1] * 3, rows[1] * 3 + 3), ndm, geomTransfs.get(Number(el.args.transfTag))?.args.vecxz)
    frames.push(...(frame ? [...frame.x, ...frame.y, ...frame.z] : [0, 0, 0, 0, 0, 0, 0, 0, 0]))
    starts.push(segmentCount)
    segmentCount += spanCount(kind, rows.length) * SEGMENTS_PER_SPAN
  }
  starts.push(segmentCount)

  return { ndm, nodeIds, nodeIndex, nodeCoords, elementIds, elementNodes, elementKind, elementFrames: Float32Array.from(frames), segmentsPerSpan: SEGMENTS_PER_SPAN, elementSegmentStart: Uint32Array.from(starts), segmentCount }
}

/**
 * Write every element's segments into `out` (6 floats per segment: start xyz, end xyz) from the
 * given per-node positions. Spans are straight today; displaced shapes replace the lerp with a
 * Hermite sample at the same stations.
 */
export function fillSegmentPositions(index: SceneIndex, nodePositions: Float32Array, out: Float32Array): void {
  let o = 0
  index.elementNodes.forEach((rows, e) => {
    for (let span = 0; span < spanCount(index.elementKind[e], rows.length); span++) {
      const [ra, rb] = spanEnds(rows, span)
      const a = ra * 3
      const b = rb * 3
      for (let s = 0; s < SEGMENTS_PER_SPAN; s++) {
        const t0 = s / SEGMENTS_PER_SPAN
        const t1 = (s + 1) / SEGMENTS_PER_SPAN
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
