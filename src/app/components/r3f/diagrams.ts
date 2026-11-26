import type { RunLayout } from '@/app/lib/resultsStorage/stepFrames'
import type { DiagramLabel, DiagramResult } from './displayBuffers'
import { wallPoint, type SceneIndex, type WallChords } from './sceneIndex'
import { readWallMembers, type WallMemberForce } from '@/app/lib/studBuilding'

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
export function fillDiagram(index: SceneIndex, layout: RunLayout, row: Float64Array, kind: DiagramKind, scale: number, out: DiagramArrays, walls: 'piers' | 'members' = 'piers'): DiagramResult {
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

  // Stud walls, in their own plane (offset along the wall). A bar at fraction u of the wall's length between heights v0 and v1 (fractions of
  // its corner height), from its bottom to its top value; `inward` draws |value| on `side` whatever the sign (the colour carries it).
  const wallBar = (w: WallChords, u: number, v0: number, v1: number, bottomValue: number, topValue: number, side: 1 | -1, inward: boolean, label: 'both' | 'bottom' | 'none') => {
    if (!Number.isFinite(bottomValue) || !Number.isFinite(topValue) || fv + 36 > out.fill.length || lv + 18 > out.lines.length) return
    const [r0, r1] = [w.bottom[0].r * 3, w.bottom[w.bottom.length - 1].r * 3]
    const len = Math.hypot(c[r1] - c[r0], c[r1 + 1] - c[r0 + 1], c[r1 + 2] - c[r0 + 2]) || 1
    const ex = [0, 1, 2].map((i) => (c[r1 + i] - c[r0 + i]) / len)
    const bottom = wallPoint(c, w, u, v0) as number[], top = wallPoint(c, w, u, v1) as number[]
    const off = (p: number[], v: number) => p.map((x, i) => x + ex[i] * side * (inward ? Math.abs(v) : v) * scale)
    const ob = off(bottom, bottomValue), ot = off(top, topValue)
    const rgb = (v: number) => (v >= 0 ? POSITIVE_RGB : NEGATIVE_RGB)
    if (bottomValue * topValue >= 0) {
      const col = rgb(bottomValue + topValue)
      vertex(bottom, col); vertex(ob, col); vertex(top, col)
      vertex(ob, col); vertex(ot, col); vertex(top, col)
    } else {
      const t = bottomValue / (bottomValue - topValue), cz = bottom.map((x, i) => x + t * (top[i] - x))
      vertex(bottom, rgb(bottomValue)); vertex(ob, rgb(bottomValue)); vertex(cz, rgb(bottomValue))
      vertex(cz, rgb(topValue)); vertex(ot, rgb(topValue)); vertex(top, rgb(topValue))
    }
    segment(bottom, ob); segment(ob, ot); segment(ot, top)
    if (label !== 'none') labels.push({ position: ob as [number, number, number], value: bottomValue })
    if (label === 'both' && topValue !== bottomValue) labels.push({ position: ot as [number, number, number], value: topValue })
  }

  if (kind === 'axial' && walls === 'members') {
    // Every framing member's axial force (tension positive) along its own line: full-height studs and posts bottom to top (they differ
    // by the sheathing's shear lag), jacks from the base to the head, cripples from the head to the framing top. Each wall labels only its
    // largest tension and compression.
    for (const w of index.studWalls) {
      const entry = layout.columns.studWall.get(index.elementIds[w.e])
      if (!entry) continue
      const members = readWallMembers(entry.labels, (k) => row[entry.offset + k])
      const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * w.length
      const head = (m: WallMemberForce) => w.openings.find((o) => (m.kind === 'jack' ? near(o.x0, m.x) || near(o.x1, m.x) : m.x > o.x0 && m.x < o.x1))?.head
      const ext = (m: WallMemberForce) => (Math.abs(m.bottom) >= Math.abs(m.top) ? m.bottom : m.top)
      const hi = members.reduce<WallMemberForce | null>((b, m) => (ext(m) > 0 && (!b || ext(m) > ext(b)) ? m : b), null)
      const lo = members.reduce<WallMemberForce | null>((b, m) => (ext(m) < 0 && (!b || ext(m) < ext(b)) ? m : b), null)
      for (const m of members) {
        const h = head(m)
        const [v0, v1] = m.kind === 'stud' || h === undefined ? [0, w.framing] : m.kind === 'jack' ? [0, h / w.height] : [h / w.height, w.framing]
        wallBar(w.chords, m.x / w.length, v0, v1, m.bottom, m.top, 1, false, m === hi || m === lo ? 'bottom' : 'none')
      }
    }
  } else if (kind === 'axial' || kind === 'shear' || kind === 'moment') for (const w of index.wallPiers) {
    // Piers: the chord (end-post) forces as bars up each end post into the pier (Carapace records them at the base, so constant), the pier
    // shear q × width up its centre line, and the in-plane pier moment from its base to its top value. Out-of-plane kinds don't apply.
    const entry = layout.columns.studWall.get(index.elementIds[w.e])
    if (!entry) continue
    const get = (q: string) => { const k = entry.labels.indexOf(`p${w.pier}.${q}`); return k < 0 ? NaN : row[entry.offset + k] }
    const mid = (w.u0 + w.u1) / 2
    if (kind === 'axial') {
      wallBar(w.chords, w.u0, 0, 1, get('chordLeft'), get('chordLeft'), 1, true, 'both')
      wallBar(w.chords, w.u1, 0, 1, get('chordRight'), get('chordRight'), -1, true, 'both')
    } else if (kind === 'shear') {
      const v = get('q') * w.width
      wallBar(w.chords, mid, 0, 1, v, v, 1, false, 'both')
    } else {
      wallBar(w.chords, mid, 0, 1, get('momentBase'), get('momentTop'), 1, false, 'both')
    }
  }

  return { fillVertices: fv / 3, lineSegments: lv / 6, labels }
}
