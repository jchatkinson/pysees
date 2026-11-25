import type { ElementEntity, LoadAssignment, Model } from '@/app/types/model'
import type { Call } from '@/app/lib/commands/tokens'
import { isStudWall, studWallArgs, type FloorLoadArgs } from '@/app/lib/studWalls'
import { wallLoadSpec } from '@/app/lib/shells'
import { diaphragmArgs, isDiaphragm } from '@/app/lib/diaphragms'

// Stud walls and floor loads are Carapace-only. OpenSees export approximates them (docs/editor-plan.md, section 5):
// - each wall is a mesh of ShellMITC4s with an ElasticMembranePlateSection whose shear stiffness matches the sheathing
//   (G t = Ga, or Bv for the O86 law's initial tangent), so lateral stiffness is close; axial stiffness is not the studs';
// - a floor load becomes nodal loads on its support walls' top nodes (one-way spans, lever rule);
// - DOFs that nothing stiffens once the walls are shells (link ground nodes' rotations, diaphragm masters' out-of-plane DOFs) are fixed.

const NU = 0.25
type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: V3) => Math.hypot(...a)
const at = (o: V3, ex: V3, ey: V3, x: number, y: number): V3 => [0, 1, 2].map((k) => o[k] + ex[k] * x + ey[k] * y) as V3
const round = (v: number) => Number(v.toPrecision(12))

interface WallFrame { o: V3; ex: V3; ey: V3; L: number; H: number }
function wallFrame(model: Model, e: ElementEntity): WallFrame | null {
  const c = e.nodes.slice(0, 4).map((id) => model.nodes.get(id)?.coords)
  if (c.some((p) => !p)) return null
  const [p0, p1, , p3] = c.map((p) => [p![0] ?? 0, p![1] ?? 0, p![2] ?? 0] as V3)
  const dx = sub(p1, p0), dy = sub(p3, p0), L = len(dx), H = len(dy)
  return L > 0 && H > 0 ? { o: p0, ex: dx.map((v) => v / L) as V3, ey: dy.map((v) => v / H) as V3, L, H } : null
}

/** The wall's top-row nodes by wall-local x: the top stations plus the two top corners. */
function topNodes(e: ElementEntity, L: number): { x: number; node: number }[] {
  const a = studWallArgs(e.args)
  const out = [{ x: 0, node: e.nodes[3] }, { x: L, node: e.nodes[2] }]
  a.stations.forEach((s, i) => { if (s.chord === 'top') out.push({ x: s.x, node: e.nodes[4 + i] }) })
  return out.sort((p, q) => p.x - q.x)
}

export interface StudWallExport {
  /** Per stud-wall or diaphragm element id: the section, extra nodes and shells that stand in for it. */
  walls: Map<number, Call[]>
  /** Per node: DOFs (1-based) to fix because nothing stiffens them in the shell model. */
  fixes: Map<number, number[]>
}

/** The OpenSees stand-in for every stud wall in the model, or `null` when it has none. Tags continue after the model's own. */
export function studWallExport(model: Model): StudWallExport | null {
  const walls = [...model.elements.values()].filter((e) => isStudWall(e.eleType)).sort((a, b) => a.id - b.id)
  const diaphragms = [...model.elements.values()].filter((e) => isDiaphragm(e.eleType)).sort((a, b) => a.id - b.id)
  if (!walls.length && !diaphragms.length) return null
  let nodeTag = Math.max(0, ...model.nodes.keys()), eleTag = Math.max(0, ...model.elements.keys()), secTag = Math.max(0, ...model.sections.keys())
  const out: StudWallExport = { walls: new Map(), fixes: new Map() }
  const stiff = new Map<number, Set<number>>() // node -> DOFs some element stiffens
  const mark = (node: number, dofs: number[]) => { const s = stiff.get(node) ?? new Set<number>(); dofs.forEach((d) => s.add(d)); stiff.set(node, s) }
  for (const e of walls) {
    const f = wallFrame(model, e)
    const a = studWallArgs(e.args)
    if (!f || !a.layout) { out.walls.set(e.id, [{ fn: '#', args: [`WARNING: stud wall ${e.id} has missing corner nodes and was not exported`] }]); continue }
    const { layout } = a
    const law = layout.sheathing?.law
    const ga = law?.kind === 'linear' ? law.ga : law?.kind === 'o86' ? law.bv : layout.floor?.ga ?? 1
    const t = f.H / 20, G = ga / t, E = 2 * (1 + NU) * G
    const studEa = layout.studs.reduce((s, st) => s + st.ea, 0)
    const openings = layout.openings ?? []
    // Mesh lines: stations, studs at openings and opening edges across; the base, opening heads, framing top and wall top up.
    const xs = [...new Set([0, f.L, ...a.stations.map((s) => s.x), ...openings.flatMap((o) => [o.x0, o.x1])].map(round))].filter((x) => x >= 0 && x <= f.L).sort((p, q) => p - q)
    const ys = [...new Set([0, f.H, layout.height / 2, layout.height, ...openings.map((o) => o.headHeight)].map(round))].filter((y) => y >= 0 && y <= f.H).sort((p, q) => p - q)
    const known = new Map<string, number>()
    const key = (x: number, y: number) => `${round(x)}|${round(y)}`
    known.set(key(0, 0), e.nodes[0]); known.set(key(f.L, 0), e.nodes[1]); known.set(key(f.L, f.H), e.nodes[2]); known.set(key(0, f.H), e.nodes[3])
    a.stations.forEach((s, i) => known.set(key(s.x, s.chord === 'top' ? f.H : 0), e.nodes[4 + i]))
    const sec = ++secTag
    const calls: Call[] = [{ fn: 'section', args: ['ElasticMembranePlateSection', sec, round(E), NU, round(t), 0], comment: `WARNING: stud wall ${e.id}${a.label ? ` (${a.label})` : ''} is Carapace-only; exported as elastic shells matching the sheathing shear stiffness (G t = ${round(ga)}). Their axial stiffness is ${Math.round(100 * E * t * f.L / Math.max(studEa, 1e-30))}% of the studs'; hold-down, nail-slip and floor-zone behaviour are not represented.` }]
    // Nodes are made only for kept cells, so none sits unconnected inside an opening.
    const node = (x: number, y: number) => {
      let id = known.get(key(x, y))
      if (id === undefined) { id = ++nodeTag; known.set(key(x, y), id); calls.push({ fn: 'node', args: [id, ...at(f.o, f.ex, f.ey, x, y).map(round)] }) }
      return id
    }
    for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2
      if (openings.some((o) => cx > o.x0 && cx < o.x1 && cy < o.headHeight)) continue
      const quad = [node(xs[i], ys[j]), node(xs[i + 1], ys[j]), node(xs[i + 1], ys[j + 1]), node(xs[i], ys[j + 1])]
      quad.forEach((n) => mark(n, [1, 2, 3, 4, 5, 6]))
      calls.push({ fn: 'element', args: ['ShellMITC4', ++eleTag, ...quad, sec] })
    }
    out.walls.set(e.id, calls)
  }
  // A flexible diaphragm: one ShellMITC4 per sheathed bay on its own grid nodes, the membrane matching the bay's shear stiffness.
  for (const e of diaphragms) {
    const { layout } = diaphragmArgs(e.args)
    const nu = layout.u.length, nv = layout.v.length
    const span = Math.min(...layout.u.slice(1).map((x, i) => x - layout.u[i]), ...layout.v.slice(1).map((y, j) => y - layout.v[j]))
    const t = span / 20
    const sections = new Map<string, number>()
    const calls: Call[] = []
    for (let j = 0; j + 1 < nv; j++) for (let i = 0; i + 1 < nu; i++) {
      const law = layout.bays[i + j * (nu - 1)]
      if (!law) continue
      const ga = law.kind === 'linear' ? law.ga : law.bv
      let sec = sections.get(String(ga))
      if (sec === undefined) {
        sec = ++secTag; sections.set(String(ga), sec)
        const E = 2 * (1 + NU) * ga / t
        calls.push({ fn: 'section', args: ['ElasticMembranePlateSection', sec, round(E), NU, round(t), 0], comment: `WARNING: flexible diaphragm ${e.id} is Carapace-only; exported as elastic shells matching the sheathing shear stiffness (G t = ${round(ga)}). Chord axial stiffness, nail slip and openings' framing are not represented.` })
      }
      const quad = [e.nodes[i + j * nu], e.nodes[i + 1 + j * nu], e.nodes[i + 1 + (j + 1) * nu], e.nodes[i + (j + 1) * nu]]
      quad.forEach((n) => mark(n, [1, 2, 3, 4, 5, 6]))
      calls.push({ fn: 'element', args: ['ShellMITC4', ++eleTag, ...quad, sec] })
    }
    out.walls.set(e.id, calls)
  }
  // What else stiffens a node: other elements on all their DOFs (zero-lengths only on their directions), and constraints, which make a
  // constrained DOF follow its retained node (both ends count as stiffened, as the tie carries the stiffness across).
  for (const e of model.elements.values()) {
    if (isStudWall(e.eleType) || isDiaphragm(e.eleType)) continue
    const dofs = e.eleType === 'zeroLength' && Array.isArray(e.args.dir) ? (e.args.dir as number[]).map(Number) : [1, 2, 3, 4, 5, 6]
    e.nodes.forEach((n) => mark(n, dofs))
  }
  for (const mp of model.mpConstraints.values()) {
    const r = Number(mp.args.rNodeTag)
    if (mp.kind === 'equalDOF') { const d = (mp.args.dofs as number[]).map(Number); mark(r, d); mark(Number(mp.args.cNodeTag), d) }
    else if (mp.kind === 'rigidDiaphragm') { const p = Number(mp.args.perpDirn); mark(r, [1, 2, 3].filter((k) => k !== p).concat(3 + p)) }
    else { mark(r, [1, 2, 3, 4, 5, 6]); if (mp.args.cNodeTag !== undefined) mark(Number(mp.args.cNodeTag), [1, 2, 3, 4, 5, 6]) }
  }
  for (const id of model.nodes.keys()) {
    const s = stiff.get(id) ?? new Set<number>()
    const free = [1, 2, 3, 4, 5, 6].filter((d) => !s.has(d) && !model.fixes.get(id)?.dofs.includes(d))
    if (free.length && free.length < 6) out.fixes.set(id, free)
  }
  return out
}

/** Spreads a load on a wall's top row onto its top nodes (linear hat functions between them): a point at `x0` (`x1` null) of local
 * components `w0` (along, up), or a line load from `x0` to `x1` varying linearly from `w0` to `w1` per unit length. */
function spreadOnTop(model: Model, e: ElementEntity, add: (node: number, v: V3) => void, x0: number, x1: number | null, w0: [number, number], w1: [number, number]) {
  const f = wallFrame(model, e)
  if (!f) return
  const glob = (w: [number, number]): V3 => [0, 1, 2].map((k) => f.ex[k] * w[0] + f.ey[k] * w[1]) as V3
  const tops = topNodes(e, f.L)
  if (x1 === null) {
    for (let k = 0; k + 1 < tops.length; k++) {
      const p = tops[k], n = tops[k + 1], dx = n.x - p.x
      if (dx <= 0 || x0 < p.x || x0 > n.x) continue
      const r = (x0 - p.x) / dx, g = glob(w0)
      add(p.node, g.map((v) => v * (1 - r)) as V3); add(n.node, g.map((v) => v * r) as V3)
      return
    }
    return
  }
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1)
  const w = (x: number): [number, number] => { const r = x1 === x0 ? 0 : (x - x0) / (x1 - x0); return [w0[0] + (w1[0] - w0[0]) * r, w0[1] + (w1[1] - w0[1]) * r] }
  for (let k = 0; k + 1 < tops.length; k++) {
    const p = tops[k], n = tops[k + 1], dx = n.x - p.x
    const u = Math.max(xa, p.x), v = Math.min(xb, n.x)
    if (dx <= 0 || v <= u) continue
    // Two-point Gauss: exact for a linear load times a linear shape function.
    for (const s of [-1, 1]) {
      const x = (u + v) / 2 + s * (v - u) / (2 * Math.sqrt(3)), r = (x - p.x) / dx, g = glob(w(x)).map((c) => c * (v - u) / 2) as V3
      add(p.node, g.map((c) => c * (1 - r)) as V3); add(n.node, g.map((c) => c * r) as V3)
    }
  }
}

/** A Carapace-only wall load (`eleLoad` of a wall type) as nodal loads on each wall's top nodes. */
export function wallLoadNodal(model: Model, child: LoadAssignment): Call[] {
  const a = child.args as { eleTags?: number[] }
  const w = wallLoadSpec(child.args)
  const ndf = model.config?.ndf ?? 6
  const forces = new Map<number, V3>()
  const add = (node: number, v: V3) => { const f = forces.get(node) ?? [0, 0, 0]; forces.set(node, [f[0] + v[0], f[1] + v[1], f[2] + v[2]]) }
  for (const tag of a.eleTags ?? []) {
    const e = model.elements.get(tag)
    if (!e || !isStudWall(e.eleType)) continue
    if (w.kind === 'topPoint') spreadOnTop(model, e, add, w.x, null, [w.fx, w.fy], [w.fx, w.fy])
    else spreadOnTop(model, e, add, w.x0, w.x1, [w.wx0, w.wy0], [w.wx1, w.wy1])
  }
  const calls: Call[] = [...forces].sort(([p], [q]) => p - q).map(([node, v]) => ({ fn: 'load', args: [node, ...Array.from({ length: ndf }, (_, i) => (i < Math.min(3, ndf) ? round(v[i]) : 0))] }))
  if (calls.length) calls[0].comment = `WARNING: Carapace-only wall load (${w.kind === 'topPoint' ? 'top point' : 'top line'}) on wall${(a.eleTags ?? []).length > 1 ? 's' : ''} ${(a.eleTags ?? []).join(', ')} written as nodal loads on the top nodes.`
  return calls
}

/** A floor load's reactions as nodal loads on its support walls' top nodes, in the floor's pattern. One-way spans between the supports
 * sorted by `s` (simple spans, lever rule; load beyond the outer supports goes to the nearest one). `continuous` is treated as simple. */
export function floorLoadNodal(model: Model, child: LoadAssignment): Call[] {
  const a = child.args as unknown as FloorLoadArgs
  const supports = [...a.supports].sort((p, q) => p.s - q.s)
  const ndf = model.config?.ndf ?? 6
  const forces = new Map<number, V3>()
  const add = (node: number, v: V3) => { const f = forces.get(node) ?? [0, 0, 0]; forces.set(node, [f[0] + v[0], f[1] + v[1], f[2] + v[2]]) }
  if (!supports.length) return []
  const levels = [...new Set(supports.map((s) => s.s))]
  // Share of a load at `s` taken by each support level (lever rule within its span).
  const share = (s: number): [number, number][] => {
    if (s <= levels[0]) return [[levels[0], 1]]
    if (s >= levels[levels.length - 1]) return [[levels[levels.length - 1], 1]]
    const i = levels.findIndex((l, k) => s >= l && s <= levels[k + 1])
    const r = (s - levels[i]) / (levels[i + 1] - levels[i])
    return [[levels[i], 1 - r], [levels[i + 1], r]]
  }
  // Force per unit t on each support level from an area load `w` over s ∈ [c, d] (exact over each span).
  const areaShare = (w: number, c: number, d: number): Map<number, number> => {
    const out = new Map<number, number>()
    const put = (l: number, v: number) => out.set(l, (out.get(l) ?? 0) + v)
    const cuts = [...new Set([c, d, ...levels.filter((l) => l > c && l < d)])].sort((p, q) => p - q)
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p = cuts[k], q = cuts[k + 1], mid = (p + q) / 2
      const sh = share(mid)
      if (sh.length === 1) { put(sh[0][0], w * (q - p)); continue }
      const [lo, hi] = [sh[0][0], sh[1][0]], span = hi - lo
      const toHi = w * ((q - lo) ** 2 - (p - lo) ** 2) / (2 * span)
      put(hi, toHi); put(lo, w * (q - p) - toHi)
    }
    return out
  }
  // A load along a support's line (per unit t over [t0, t1], or a point at t) onto that wall's top nodes.
  const onWall = (sup: FloorLoadArgs['supports'][number], q: number, t0: number, t1: number, point = false) => {
    const e = model.elements.get(sup.wall)
    if (!e) return
    const lo = Math.max(t0, sup.t0), hi = Math.min(t1, sup.t1)
    if (point ? t0 < sup.t0 || t0 > sup.t1 : hi <= lo) return
    const toX = (t: number) => sup.xAtT0 + (sup.reversed ? -1 : 1) * (t - sup.t0)
    spreadOnTop(model, e, add, toX(lo), point ? null : toX(hi), [0, -q], [0, -q])
  }
  const [b0, b1, b2, b3] = a.bounds
  for (const load of a.loads) {
    if (load.kind === 'area') {
      const [s0, s1, t0, t1] = load.region ?? [b0, b1, b2, b3]
      for (const [level, q] of areaShare(load.w, s0, s1)) for (const sup of supports) if (sup.s === level) onWall(sup, q, t0, t1)
    } else if (load.kind === 'line') {
      for (const [level, r] of share(load.s)) for (const sup of supports) if (sup.s === level) onWall(sup, load.w * r, load.t0, load.t1)
    } else if (load.kind === 'lineAlong') {
      for (const [level, q] of areaShare(load.w, load.s0, load.s1)) for (const sup of supports) if (sup.s === level) onWall(sup, q, load.t, load.t, true)
    } else {
      for (const [level, r] of share(load.s)) for (const sup of supports) if (sup.s === level) onWall(sup, load.p * r, load.t, load.t, true)
    }
  }
  const calls: Call[] = [...forces].sort(([p], [q]) => p - q).map(([node, v]) => ({ fn: 'load', args: [node, ...Array.from({ length: ndf }, (_, i) => (i < 3 ? round(v[i]) : 0))] }))
  if (calls.length) calls[0].comment = `WARNING: Carapace-only floor load (${a.continuity} one-way spans) written as its reactions on the support walls' top nodes.`
  return calls
}
