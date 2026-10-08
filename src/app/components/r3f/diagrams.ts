import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { DiagramLabel, DiagramResult } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'

/** In 2D `shear` and `moment` are V and M in the plane; in 3D they are Vy and Mz (bending in the local x–y plane), with `shearZ`/`momentY` the x–z plane and `torsion` T. */
export type DiagramKind = 'axial' | 'shear' | 'shearZ' | 'torsion' | 'moment' | 'momentY'

export interface DiagramArrays {
  fill: Float32Array
  fillColor: Float32Array
  lines: Float32Array
}

const POSITIVE_RGB = [0.145, 0.388, 0.922] // #2563eb
const NEGATIVE_RGB = [0.863, 0.149, 0.149] // #dc2626

/** Uniform load on a member, force/length in its local axes: `wx` along the member, `wy` (and in 3D `wz`) transverse. */
export interface MemberLoad { wx: number; wy: number }

/**
 * Internal force in one bending plane of a member from its true end forces on the element (local frame, i end:
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

/** Recorded component names (compileInputV1): the in-plane shear and moment at end i, and the j-end global force of a truss. */
const FORCE_LABELS = {
  2: { vy: 'Vi', mz: 'Mi', truss: ['Nj', 'Vj'] },
  3: { vy: 'Vyi', mz: 'Mzi', truss: ['Fxj', 'Fyj', 'Fzj'] },
}

/**
 * Write N, V, M or T diagrams for every two-node beam-column (and axial for trusses) into `out`, drawn
 * on the undeformed geometry, offset along the member's local y (z for the x–z plane) by value x `scale` (moment on the
 * tension side). Output is compacted: only live triangles / segments are written, and the counts
 * are returned. Elements with no force recorder are skipped.
 * A loaded member's recorded load (`wx`/`wy`/`wz` columns, see `elementLoadLabels`) shapes the diagram between the ends,
 * and a moment diagram also labels its interior extremum (where shear crosses zero).
 */
export function fillDiagram(index: SceneIndex, layout: RunLayout, row: Float64Array, kind: DiagramKind, scale: number, out: DiagramArrays): DiagramResult {
  const n = index.segmentsPerSpan
  const c = index.nodeCoords
  const names = FORCE_LABELS[index.ndm]
  const labels: DiagramLabel[] = []
  const values = new Float64Array(n + 1)
  let fv = 0 // fill floats written
  let lv = 0 // line floats written

  const vertex = (p: number[], rgb: number[]) => {
    out.fill[fv] = p[0]; out.fill[fv + 1] = p[1]; out.fill[fv + 2] = p[2]
    out.fillColor[fv] = rgb[0]; out.fillColor[fv + 1] = rgb[1]; out.fillColor[fv + 2] = rgb[2]
    fv += 3
  }
  const segment = (p: number[], q: number[]) => {
    out.lines[lv] = p[0]; out.lines[lv + 1] = p[1]; out.lines[lv + 2] = p[2]
    out.lines[lv + 3] = q[0]; out.lines[lv + 4] = q[1]; out.lines[lv + 5] = q[2]
    lv += 6
  }
  // Bending plane the diagram lives in: 'y' bends in local x–y (shear Vy, moment Mz), 'z' in x–z (Vz, My).
  const plane: 'y' | 'z' = kind === 'shearZ' || kind === 'momentY' ? 'z' : 'y'

  index.elementIds.forEach((id, e) => {
    const rows = index.elementNodes[e]
    const entry = layout.columns.force.get(id)
    const elementKind = index.elementKind[e]
    if (!entry || rows.length !== 2 || elementKind === 'other' || (elementKind === 'truss' && kind !== 'axial')) return
    const a = rows[0] * 3
    const b = rows[1] * 3
    const dx = c[b] - c[a]
    const dy = c[b + 1] - c[a + 1]
    const dz = c[b + 2] - c[a + 2]
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-9) return
    const fr = index.elementFrames.subarray(e * 9, e * 9 + 9)
    const f = (label: string) => row[entry.offset + entry.labels.indexOf(label)]
    const has = (label: string) => entry.labels.includes(label)
    const load: MemberLoad = { wx: has('wx') ? f('wx') : 0, wy: has(plane === 'z' ? 'wz' : 'wy') ? f(plane === 'z' ? 'wz' : 'wy') : 0 }
    let interior: { x: number; value: number } | null = null

    if (elementKind === 'truss') {
      // Truss force is recorded in the global frame; axial force is the j-end force along the chord.
      const chord = [dx / len, dy / len, dz / len]
      values.fill(names.truss.reduce((sum, label, k) => sum + f(label) * chord[k], 0))
    } else if (kind === 'torsion') {
      values.fill(-f('Ti'))
    } else {
      // Plane z maps onto the x–y formulas with the shear force Vz and the moment -My (rotation about y is opposite in sense to about z).
      const fx = f('Ni'), fy = plane === 'z' ? f('Vzi') : f(names.vy), mz = plane === 'z' ? -f('Myi') : f(names.mz)
      for (let k = 0; k <= n; k++) {
        const s = sectionForces(fx, fy, mz, load, (k / n) * len)
        values[k] = kind === 'axial' ? s.n : kind === 'shear' || kind === 'shearZ' ? s.v : s.m
      }
      // Moment is extreme where shear is zero; label it when that falls inside the span and beats both ends.
      const xv = load.wy !== 0 ? -fy / load.wy : NaN
      if ((kind === 'moment' || kind === 'momentY') && xv > 1e-9 * len && xv < len * (1 - 1e-9)) {
        const value = sectionForces(fx, fy, mz, load, xv).m
        if (Math.abs(value) > Math.max(Math.abs(values[0]), Math.abs(values[n]))) interior = { x: xv, value }
      }
    }
    // Offset direction: the local axis of the bending plane for N, V and T, toward the tension side (against it, for sagging-positive M) for moment.
    const dir = kind === 'moment' || kind === 'momentY' ? -1 : 1
    const o = plane === 'z' ? 6 : 3
    const ox = fr[o] * dir * scale, oy = fr[o + 1] * dir * scale, oz = fr[o + 2] * dir * scale
    const base = (k: number) => [c[a] + (k / n) * dx, c[a + 1] + (k / n) * dy, c[a + 2] + (k / n) * dz]
    const off = (p: number[], v: number) => [p[0] + v * ox, p[1] + v * oy, p[2] + v * oz]

    for (let k = 0; k < n; k++) {
      const va = values[k], vb = values[k + 1]
      const ba = base(k), bb = base(k + 1)
      const oa = off(ba, va), ob = off(bb, vb)
      segment(oa, ob)
      if (va * vb >= 0) {
        const rgb = (va + vb) >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
        vertex(ba, rgb); vertex(oa, rgb); vertex(bb, rgb)
        vertex(oa, rgb); vertex(ob, rgb); vertex(bb, rgb)
      } else {
        // Sign change inside the span: split at the zero crossing so each side is one correctly coloured triangle.
        const t = va / (va - vb)
        const cz = [ba[0] + t * (bb[0] - ba[0]), ba[1] + t * (bb[1] - ba[1]), ba[2] + t * (bb[2] - ba[2])]
        const ra = va >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
        const rb = vb >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
        vertex(ba, ra); vertex(oa, ra); vertex(cz, ra)
        vertex(cz, rb); vertex(ob, rb); vertex(bb, rb)
      }
    }
    // Close the diagram at both ends.
    segment(base(0), off(base(0), values[0]))
    segment(base(n), off(base(n), values[n]))
    if (interior) labels.push({ position: off(base((interior.x / len) * n), interior.value) as [number, number, number], value: interior.value })
    labels.push({ position: off(base(0), values[0]) as [number, number, number], value: values[0] })
    labels.push({ position: off(base(n), values[n]) as [number, number, number], value: values[n] })
  })

  return { fillVertices: fv / 3, lineSegments: lv / 6, labels }
}
