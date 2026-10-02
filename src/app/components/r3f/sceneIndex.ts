import type { ElementEntity, NodeEntity } from '@/app/types/model'
import { toVec3 } from './utils'

/** Line segments each element span is split into. Fixed so the line buffer layout never changes
 * between undeformed and displaced display — only the positions are rewritten. */
export const SEGMENTS_PER_SPAN = 8

/**
 * Stable, array-backed view of the model for the GPU buffers. Node row `i` / element row `j` are
 * positions in the sorted-by-id lists below; results data and instance buffers are indexed by them.
 */
export type ElementKind = 'beam' | 'truss' | 'other'

export interface SceneIndex {
  nodeIds: number[]
  nodeIndex: Map<number, number>
  /** Undeformed xyz per node, `3 * nodeIds.length`. */
  nodeCoords: Float32Array
  /** Elements with at least two resolvable nodes. */
  elementIds: number[]
  /** Per element: node rows along the member, in element order. */
  elementNodes: number[][]
  /** Per element: beam-columns get cubic displaced shapes and N/V/M diagrams; trusses only axial; the rest interpolate linearly. */
  elementKind: ElementKind[]
  segmentsPerSpan: number
  /** Per element: first segment index in the line buffer; `elementSegmentStart[elementIds.length]` is the total. */
  elementSegmentStart: Uint32Array
  segmentCount: number
}

export function buildSceneIndex(
  nodes: Map<number, NodeEntity>,
  elements: Map<number, ElementEntity>,
): SceneIndex {
  const sortedNodes = [...nodes.values()].sort((a, b) => a.id - b.id)
  const nodeIds = sortedNodes.map((n) => n.id)
  const nodeIndex = new Map(nodeIds.map((id, i) => [id, i]))
  const nodeCoords = new Float32Array(nodeIds.length * 3)
  sortedNodes.forEach((n, i) => nodeCoords.set(toVec3(n.coords), i * 3))

  const elementIds: number[] = []
  const elementNodes: number[][] = []
  const elementKind: ElementKind[] = []
  const starts: number[] = []
  let segmentCount = 0
  for (const el of [...elements.values()].sort((a, b) => a.id - b.id)) {
    const rows = el.nodes.map((id) => nodeIndex.get(id)).filter((r): r is number => r !== undefined)
    if (rows.length < 2) continue
    elementIds.push(el.id)
    elementNodes.push(rows)
    elementKind.push(/BeamColumn$/i.test(el.eleType) ? 'beam' : /^truss$/i.test(el.eleType) ? 'truss' : 'other')
    starts.push(segmentCount)
    segmentCount += (rows.length - 1) * SEGMENTS_PER_SPAN
  }
  starts.push(segmentCount)

  return { nodeIds, nodeIndex, nodeCoords, elementIds, elementNodes, elementKind, segmentsPerSpan: SEGMENTS_PER_SPAN, elementSegmentStart: Uint32Array.from(starts), segmentCount }
}

/**
 * Write every element's segments into `out` (6 floats per segment: start xyz, end xyz) from the
 * given per-node positions. Spans are straight today; displaced shapes replace the lerp with a
 * Hermite sample at the same stations.
 */
export function fillSegmentPositions(index: SceneIndex, nodePositions: Float32Array, out: Float32Array): void {
  let o = 0
  for (const rows of index.elementNodes) {
    for (let span = 0; span < rows.length - 1; span++) {
      const a = rows[span] * 3
      const b = rows[span + 1] * 3
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
  }
}
