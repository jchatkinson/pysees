import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { NodeLabel } from './displayBuffers'
import { spanCount, spanEnds, type SceneIndex } from './sceneIndex'

/** Per-node displacement read from a step row. `rot` holds `[rx, ry, rz]` per node (a 2D model only has rz), NaN where not recorded. */
export interface NodeDisplacements {
  disp: Float32Array
  rot: Float32Array
}

export function createNodeDisplacements(nodeCount: number): NodeDisplacements {
  return { disp: new Float32Array(nodeCount * 3), rot: new Float32Array(nodeCount * 3).fill(NaN) }
}

/** Pull every node's displacements and rotations out of a step row. Nodes without a displacement recorder get zeros / NaN rotations. */
export function readNodeDisplacements(index: SceneIndex, layout: RunLayout, row: Float64Array, out: NodeDisplacements): void {
  out.disp.fill(0)
  out.rot.fill(NaN)
  const axes = ['dx', 'dy', 'dz']
  const rotations = ['rx', 'ry', 'rz']
  for (let i = 0; i < index.nodeIds.length; i++) {
    const entry = layout.columns.disp.get(index.nodeIds[i])
    if (!entry) continue
    axes.forEach((axis, k) => {
      const c = entry.labels.indexOf(axis)
      if (c >= 0) out.disp[i * 3 + k] = row[entry.offset + c]
    })
    rotations.forEach((name, k) => {
      const c = entry.labels.indexOf(name)
      if (c >= 0) out.rot[i * 3 + k] = row[entry.offset + c]
    })
  }
}

/** Node positions with the displacement amplified by `scale`. */
export function displaceNodes(index: SceneIndex, nd: NodeDisplacements, scale: number, out: Float32Array): void {
  for (let k = 0; k < out.length; k++) out[k] = index.nodeCoords[k] + scale * nd.disp[k]
}

/**
 * Element segments (same layout as `fillSegmentPositions`) at the displaced shape, displacement amplified by
 * `scale`. Beam-columns with their end rotations recorded follow the Hermite cubic (small-displacement beam shape in
 * the member's local frame: bending in x–y from rz, and in 3D x–z from ry); every other span interpolates the end displacements linearly.
 */
export function fillDeformedSegments(index: SceneIndex, nd: NodeDisplacements, scale: number, out: Float32Array): void {
  const n = index.segmentsPerSpan
  const station = new Float32Array((n + 1) * 3)
  const c = index.nodeCoords
  const ndm3 = index.ndm === 3
  let o = 0
  index.elementNodes.forEach((rows, e) => {
    const f = index.elementFrames.subarray(e * 9, e * 9 + 9)
    for (let span = 0; span < spanCount(index.elementKind[e], rows.length); span++) {
      const [a, b] = spanEnds(rows, span)
      const len = Math.hypot(c[b * 3] - c[a * 3], c[b * 3 + 1] - c[a * 3 + 1], c[b * 3 + 2] - c[a * 3 + 2])
      const rotOk = (i: number) => !Number.isNaN(nd.rot[i * 3 + 2]) && (!ndm3 || !Number.isNaN(nd.rot[i * 3 + 1]))
      const cubic = span === 0 && index.elementKind[e] === 'beam' && len > 1e-9 && rows.length === 2 && rotOk(a) && rotOk(b)
      // End displacements in the member's local frame: u along it, v along local y, w along local z.
      const local = (i: number, axis: number) => nd.disp[i * 3] * f[axis * 3] + nd.disp[i * 3 + 1] * f[axis * 3 + 1] + nd.disp[i * 3 + 2] * f[axis * 3 + 2]
      const [ua, va, wa, ub, vb, wb] = [local(a, 0), local(a, 1), local(a, 2), local(b, 0), local(b, 1), local(b, 2)]
      // Rotation about local z bends the member in x–y; rotation about local y bends it in x–z with the opposite sign (dw/dx = -θy).
      const rotLocal = (i: number, axis: number) => ndm3
        ? nd.rot[i * 3] * f[axis * 3] + nd.rot[i * 3 + 1] * f[axis * 3 + 1] + nd.rot[i * 3 + 2] * f[axis * 3 + 2]
        : nd.rot[i * 3 + 2] * f[axis * 3 + 2]
      const [tza, tzb] = cubic ? [rotLocal(a, 2), rotLocal(b, 2)] : [0, 0]
      const [tya, tyb] = cubic && ndm3 ? [rotLocal(a, 1), rotLocal(b, 1)] : [0, 0]
      for (let k = 0; k <= n; k++) {
        const t = k / n
        let dx: number, dy: number, dz: number
        if (cubic) {
          const h1 = 1 - 3 * t * t + 2 * t ** 3, h2 = len * (t - 2 * t * t + t ** 3), h3 = 3 * t * t - 2 * t ** 3, h4 = len * (-t * t + t ** 3)
          const u = ua + t * (ub - ua)
          const v = va * h1 + tza * h2 + vb * h3 + tzb * h4
          const w = wa * h1 - tya * h2 + wb * h3 - tyb * h4
          dx = u * f[0] + v * f[3] + w * f[6]; dy = u * f[1] + v * f[4] + w * f[7]; dz = u * f[2] + v * f[5] + w * f[8]
        } else {
          dx = nd.disp[a * 3] + t * (nd.disp[b * 3] - nd.disp[a * 3]); dy = nd.disp[a * 3 + 1] + t * (nd.disp[b * 3 + 1] - nd.disp[a * 3 + 1]); dz = nd.disp[a * 3 + 2] + t * (nd.disp[b * 3 + 2] - nd.disp[a * 3 + 2])
        }
        const d = [dx, dy, dz]
        for (let q = 0; q < 3; q++) station[k * 3 + q] = c[a * 3 + q] + t * (c[b * 3 + q] - c[a * 3 + q]) + scale * d[q]
      }
      for (let k = 0; k < n; k++) {
        for (let d = 0; d < 3; d++) {
          out[o + d] = station[k * 3 + d]
          out[o + 3 + d] = station[(k + 1) * 3 + d]
        }
        o += 6
      }
    }
  })
}

const fmt = (v: number) => (Math.abs(v) < 1e-12 ? '0' : Number(v.toPrecision(3)).toString())

/**
 * Displacement text per recorded node, at the node's displayed position: one `name: value` line per
 * recorded component (e.g. `dx: 0.0123`), in recorded order. Values are the true displacements, not scaled.
 */
export function nodeValueLabels(index: SceneIndex, layout: RunLayout, row: Float64Array, positions: Float32Array): NodeLabel[] {
  const labels: NodeLabel[] = []
  for (let i = 0; i < index.nodeIds.length; i++) {
    const entry = layout.columns.disp.get(index.nodeIds[i])
    if (!entry) continue
    const text = entry.labels.map((name, c) => `${name}: ${fmt(row[entry.offset + c])}`).join('\n')
    labels.push({ position: [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], text })
  }
  return labels
}
