import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { NodeLabel } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'

/** Per-node displacement read from a step row. `rot` is the in-plane rotation (rz), NaN when not recorded. */
export interface NodeDisplacements {
  disp: Float32Array
  rot: Float32Array
}

export function createNodeDisplacements(nodeCount: number): NodeDisplacements {
  return { disp: new Float32Array(nodeCount * 3), rot: new Float32Array(nodeCount).fill(NaN) }
}

/** Pull every node's dx/dy/dz/rz out of a step row. Nodes without a displacement recorder get zeros / NaN rotation. */
export function readNodeDisplacements(index: SceneIndex, layout: RunLayout, row: Float64Array, out: NodeDisplacements): void {
  out.disp.fill(0)
  out.rot.fill(NaN)
  const axes = ['dx', 'dy', 'dz']
  for (let i = 0; i < index.nodeIds.length; i++) {
    const entry = layout.columns.disp.get(index.nodeIds[i])
    if (!entry) continue
    axes.forEach((axis, k) => {
      const c = entry.labels.indexOf(axis)
      if (c >= 0) out.disp[i * 3 + k] = row[entry.offset + c]
    })
    const r = entry.labels.indexOf('rz')
    if (r >= 0) out.rot[i] = row[entry.offset + r]
  }
}

/** Node positions with the displacement amplified by `scale`. */
export function displaceNodes(index: SceneIndex, nd: NodeDisplacements, scale: number, out: Float32Array): void {
  for (let k = 0; k < out.length; k++) out[k] = index.nodeCoords[k] + scale * nd.disp[k]
}

/**
 * Element segments (same layout as `fillSegmentPositions`) at the displaced shape, displacement amplified by
 * `scale`. Planar beam-columns with both end rotations recorded follow the Hermite cubic (small-displacement
 * beam shape in the undeformed chord frame); every other span interpolates the end displacements linearly.
 */
export function fillDeformedSegments(index: SceneIndex, nd: NodeDisplacements, scale: number, planar: boolean, out: Float32Array): void {
  const n = index.segmentsPerSpan
  const station = new Float32Array((n + 1) * 3)
  const c = index.nodeCoords
  let o = 0
  index.elementNodes.forEach((rows, e) => {
    for (let span = 0; span < rows.length - 1; span++) {
      const a = rows[span]
      const b = rows[span + 1]
      const dxc = c[b * 3] - c[a * 3]
      const dyc = c[b * 3 + 1] - c[a * 3 + 1]
      const len = Math.hypot(dxc, dyc)
      const cubic = planar && index.elementKind[e] === 'beam' && len > 1e-9 && !Number.isNaN(nd.rot[a]) && !Number.isNaN(nd.rot[b])
      const cs = dxc / len
      const sn = dyc / len
      // End displacements in the chord frame (x along the member, y 90° counter-clockwise from it).
      const ua = nd.disp[a * 3] * cs + nd.disp[a * 3 + 1] * sn
      const va = -nd.disp[a * 3] * sn + nd.disp[a * 3 + 1] * cs
      const ub = nd.disp[b * 3] * cs + nd.disp[b * 3 + 1] * sn
      const vb = -nd.disp[b * 3] * sn + nd.disp[b * 3 + 1] * cs
      for (let k = 0; k <= n; k++) {
        const t = k / n
        for (let d = 0; d < 3; d++) {
          const base = c[a * 3 + d] + t * (c[b * 3 + d] - c[a * 3 + d])
          let disp: number
          if (cubic && d < 2) {
            const u = ua + t * (ub - ua)
            const v = va * (1 - 3 * t * t + 2 * t ** 3) + nd.rot[a] * len * (t - 2 * t * t + t ** 3)
              + vb * (3 * t * t - 2 * t ** 3) + nd.rot[b] * len * (-t * t + t ** 3)
            disp = d === 0 ? u * cs - v * sn : u * sn + v * cs
          } else {
            disp = nd.disp[a * 3 + d] + t * (nd.disp[b * 3 + d] - nd.disp[a * 3 + d])
          }
          station[k * 3 + d] = base + scale * disp
        }
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
