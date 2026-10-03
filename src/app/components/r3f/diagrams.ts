import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { DiagramLabel, DiagramResult } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'

export type DiagramKind = 'axial' | 'shear' | 'moment'

export interface DiagramArrays {
  fill: Float32Array
  fillColor: Float32Array
  lines: Float32Array
}

const POSITIVE_RGB = [0.145, 0.388, 0.922] // #2563eb
const NEGATIVE_RGB = [0.863, 0.149, 0.149] // #dc2626

/** Uniform load on a member, force/length in its local axes: `wx` along the member, `wy` transverse (local +y). */
export interface MemberLoad { wx: number; wy: number }

/**
 * Internal force along a planar member from its true end forces on the element (local frame, i end:
 * `fx`, `fy`, `mz`, which already include the load's fixed-end effect) and the uniform load it carries, at
 * distance `x` from i. Free body of the part from i to the cut, so these hold for any end-force sign the solver uses:
 *   N = -(fx + wx x)           (tension positive)
 *   V = fy + wy x              (sum of transverse forces left of the cut, up positive)
 *   M = -mz + fy x + wy x^2/2  (sagging positive)
 * With no load these are the linear interpolation of the end forces; with one, V stays linear but M is a parabola
 * (and N linear), which interpolating the end values would miss.
 */
export function sectionForces(fx: number, fy: number, mz: number, load: MemberLoad, x: number): { n: number; v: number; m: number } {
  return { n: -(fx + load.wx * x), v: fy + load.wy * x, m: -mz + fy * x + (load.wy * x * x) / 2 }
}

/**
 * Write N, V or M diagrams for every two-node beam-column (and axial for trusses) into `out`, drawn
 * on the undeformed geometry, offset perpendicular to the member by value x `scale` (moment on the
 * tension side). Output is compacted: only live triangles / segments are written, and the counts
 * are returned. Elements with no force recorder, and anything that isn't planar, are skipped.
 * A loaded member's recorded load (`wx`/`wy` columns, see `ELEMENT_LOAD_LABELS`) shapes the diagram between the ends,
 * and a moment diagram also labels its interior extremum (where shear crosses zero).
 */
export function fillDiagram(index: SceneIndex, layout: RunLayout, row: Float64Array, kind: DiagramKind, scale: number, out: DiagramArrays): DiagramResult {
  const n = index.segmentsPerSpan
  const c = index.nodeCoords
  const labels: DiagramLabel[] = []
  const values = new Float64Array(n + 1)
  let fv = 0 // fill floats written
  let lv = 0 // line floats written

  const vertex = (x: number, y: number, z: number, rgb: number[]) => {
    out.fill[fv] = x; out.fill[fv + 1] = y; out.fill[fv + 2] = z
    out.fillColor[fv] = rgb[0]; out.fillColor[fv + 1] = rgb[1]; out.fillColor[fv + 2] = rgb[2]
    fv += 3
  }
  const segment = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    out.lines[lv] = ax; out.lines[lv + 1] = ay; out.lines[lv + 2] = az
    out.lines[lv + 3] = bx; out.lines[lv + 4] = by; out.lines[lv + 5] = bz
    lv += 6
  }

  index.elementIds.forEach((id, e) => {
    const rows = index.elementNodes[e]
    const entry = layout.columns.force.get(id)
    const elementKind = index.elementKind[e]
    if (!entry || rows.length !== 2 || elementKind === 'other' || (elementKind === 'truss' && kind !== 'axial')) return
    const a = rows[0] * 3
    const b = rows[1] * 3
    const dx = c[b] - c[a]
    const dy = c[b + 1] - c[a + 1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) return
    const cs = dx / len
    const sn = dy / len
    const f = (label: string) => row[entry.offset + entry.labels.indexOf(label)]
    const has = (label: string) => entry.labels.includes(label)
    const load: MemberLoad = { wx: has('wx') ? f('wx') : 0, wy: has('wy') ? f('wy') : 0 }
    let interior: { x: number; value: number } | null = null

    if (elementKind === 'truss') {
      // Truss force is recorded in the global frame; axial force is the j-end force along the chord.
      values.fill(f('Nj') * cs + f('Vj') * sn)
    } else {
      const fx = f('Ni'), fy = f('Vi'), mz = f('Mi')
      for (let k = 0; k <= n; k++) {
        const s = sectionForces(fx, fy, mz, load, (k / n) * len)
        values[k] = kind === 'axial' ? s.n : kind === 'shear' ? s.v : s.m
      }
      // Moment is extreme where shear is zero; label it when that falls inside the span and beats both ends.
      const xv = load.wy !== 0 ? -fy / load.wy : NaN
      if (kind === 'moment' && xv > 1e-9 * len && xv < len * (1 - 1e-9)) {
        const value = sectionForces(fx, fy, mz, load, xv).m
        if (Math.abs(value) > Math.max(Math.abs(values[0]), Math.abs(values[n]))) interior = { x: xv, value }
      }
    }
    // Offset direction: +ey for N and V, toward the tension side (-ey for sagging-positive M) for moment.
    const dir = kind === 'moment' ? -1 : 1
    const ox = -sn * dir * scale
    const oy = cs * dir * scale
    const px = (k: number) => c[a] + (k / n) * dx
    const py = (k: number) => c[a + 1] + (k / n) * dy
    const z = c[a + 2]

    for (let k = 0; k < n; k++) {
      const va = values[k], vb = values[k + 1]
      const bax = px(k), bay = py(k), bbx = px(k + 1), bby = py(k + 1)
      const oax = bax + va * ox, oay = bay + va * oy, obx = bbx + vb * ox, oby = bby + vb * oy
      segment(oax, oay, z, obx, oby, z)
      if (va * vb >= 0) {
        const rgb = (va + vb) >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
        vertex(bax, bay, z, rgb); vertex(oax, oay, z, rgb); vertex(bbx, bby, z, rgb)
        vertex(oax, oay, z, rgb); vertex(obx, oby, z, rgb); vertex(bbx, bby, z, rgb)
      } else {
        // Sign change inside the span: split at the zero crossing so each side is one correctly coloured triangle.
        const t = va / (va - vb)
        const cx = bax + t * (bbx - bax), cy = bay + t * (bby - bay)
        const ra = va >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
        const rb = vb >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
        vertex(bax, bay, z, ra); vertex(oax, oay, z, ra); vertex(cx, cy, z, ra)
        vertex(cx, cy, z, rb); vertex(obx, oby, z, rb); vertex(bbx, bby, z, rb)
      }
    }
    // Close the diagram at both ends.
    segment(px(0), py(0), z, px(0) + values[0] * ox, py(0) + values[0] * oy, z)
    segment(px(n), py(n), z, px(n) + values[n] * ox, py(n) + values[n] * oy, z)
    if (interior) {
      const t = interior.x / len
      labels.push({ position: [c[a] + t * dx + interior.value * ox, c[a + 1] + t * dy + interior.value * oy, z], value: interior.value })
    }
    labels.push({ position: [px(0) + values[0] * ox, py(0) + values[0] * oy, z], value: values[0] })
    labels.push({ position: [px(n) + values[n] * ox, py(n) + values[n] * oy, z], value: values[n] })
  })

  return { fillVertices: fv / 3, lineSegments: lv / 6, labels }
}
