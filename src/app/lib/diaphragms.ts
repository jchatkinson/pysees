import type { Model } from '@/app/types/model'
import type { WallShearLawSpec } from '@/app/types/carapaceInputV1'
import { DrawBatch, mergeTolerance } from '@/app/lib/editor/draw'
import { removeDiaphragms } from '@/app/lib/editor/edit'

/** A Carapace-only flexible (semi-rigid) diaphragm: an axis-aligned grid of nodes `i + j * u.length` at `level`, with a shear law per bay
 * (`i + j * (u.length - 1)`, null = opening) and axial stiffness along each grid line (`eaU` per v line, `eaV` per u line). Carapace's
 * `diaphragms` row; in a Z-up model u is X and v is Y. */
export interface DiaphragmLayout { u: number[]; v: number[]; level: number; bays: (WallShearLawSpec | null)[]; eaU: number[]; eaV: number[] }
export interface DiaphragmArgs { label?: string; layout: DiaphragmLayout }

export const isDiaphragm = (eleType: string) => eleType === 'diaphragm'
export const diaphragmArgs = (args: Record<string, unknown>) => args as unknown as DiaphragmArgs

/** The node ids around a diaphragm's boundary, counter-clockwise from the (u0, v0) corner. */
export function diaphragmOutline(nodes: number[], layout: DiaphragmLayout): number[] {
  const nu = layout.u.length, nv = layout.v.length
  if (nu < 2 || nv < 2 || nodes.length !== nu * nv) return []
  const at = (i: number, j: number) => nodes[i + j * nu]
  const out: number[] = []
  for (let i = 0; i < nu; i++) out.push(at(i, 0))
  for (let j = 1; j < nv; j++) out.push(at(nu - 1, j))
  for (let i = nu - 2; i >= 0; i--) out.push(at(i, nv - 1))
  for (let j = nv - 2; j > 0; j--) out.push(at(0, j))
  return out
}

/** Distinct values within `tol`, ascending (each cluster at its first value). */
function distinct(values: number[], tol: number): number[] {
  const out: number[] = []
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > tol) out.push(v)
  return out
}

export interface FlexibleDiaphragmOptions { law: WallShearLawSpec; chordEa: number; interiorEa: number }

/**
 * One flexible diaphragm per level among the selected nodes of a 3D (Z-up) model: the grid runs through every distinct X and Y of that
 * level's nodes. Grid points without a selected node reuse a node there or get a new one with its out-of-plane DOFs fixed (the diaphragm
 * carries only the two plan translations). Boundary grid lines take `chordEa`, interior ones `interiorEa`, every bay `law`. Any rigid
 * diaphragm or flexible diaphragm already holding one of the nodes is removed first.
 */
export function assignFlexibleDiaphragms(model: Model, nodeIds: number[], opts: FlexibleDiaphragmOptions): { model: Model; diaphragms: number; skipped: number } {
  const tol = mergeTolerance(model)
  const ids = nodeIds.filter((id) => model.nodes.has(id))
  // Nodal loads on a replaced rigid diaphragm's master move to the new grid at the same level (below); the master then goes if unused.
  const sel0 = new Set(ids)
  const masters = new Set([...model.mpConstraints.values()].filter((c) => c.kind === 'rigidDiaphragm' && [c.args.rNodeTag, ...((c.args.cNodeTags as unknown[]) ?? [])].some((n) => sel0.has(Number(n)))).map((c) => Number(c.args.rNodeTag)))
  const moved: { patternId: number; at: number[]; values: number[] }[] = []
  let stripped = model
  if (masters.size) {
    const patterns = new Map(model.patterns)
    for (const p of model.patterns.values()) {
      const keep = p.children.filter((ch) => {
        if (ch.kind !== 'load' || !masters.has(Number(ch.args.nodeTag)) || sel0.has(Number(ch.args.nodeTag))) return true
        moved.push({ patternId: p.id, at: model.nodes.get(Number(ch.args.nodeTag))!.coords, values: (ch.args.values as number[]).map(Number) })
        return false
      })
      if (keep.length !== p.children.length) patterns.set(p.id, { ...p, children: keep })
    }
    stripped = { ...model, patterns }
  }
  const m = removeFlexibleDiaphragms(removeDiaphragms(stripped, ids), ids)
  const levels: { z: number; nodes: number[] }[] = []
  for (const id of ids.filter((n) => m.nodes.has(n))) { // a selected node may have been a removed diaphragm's own grid node
    const z = m.nodes.get(id)!.coords[2] ?? 0
    const level = levels.find((l) => Math.abs(l.z - z) <= tol)
    if (level) level.nodes.push(id); else levels.push({ z, nodes: [id] })
  }
  const b = new DrawBatch(m)
  let diaphragms = 0, skipped = 0
  for (const { z, nodes } of levels) {
    const xy = nodes.map((id) => b.model.nodes.get(id)!.coords)
    const u = distinct(xy.map((c) => c[0]), tol), v = distinct(xy.map((c) => c[1] ?? 0), tol)
    if (u.length < 2 || v.length < 2) { skipped += nodes.length; continue }
    const grid: number[] = []
    for (const y of v) for (const x of u) {
      const mine = nodes.find((id) => { const c = b.model.nodes.get(id)!.coords; return Math.abs(c[0] - x) <= tol && Math.abs((c[1] ?? 0) - y) <= tol })
      if (mine !== undefined) { grid.push(mine); continue }
      const before = b.model.nodes.size
      const n = b.node([x, y, z])
      if (b.model.nodes.size > before) b.support(n, [3, 4, 5, 6])
      grid.push(n)
    }
    if (new Set(grid).size !== grid.length) { skipped += nodes.length; continue }
    // A selected node that shares its grid point with the grid node (another wall's coincident corner or station) follows it in plan.
    const onGrid = new Set(grid)
    for (const id of nodes) {
      if (onGrid.has(id)) continue
      const c = b.model.nodes.get(id)!.coords
      const k = u.findIndex((x) => Math.abs(x - c[0]) <= tol) + v.findIndex((y) => Math.abs(y - (c[1] ?? 0)) <= tol) * u.length
      b.writeRaw({ kind: 'mpConstraint', entity: { id: b.model.nextIds.mpConstraint, kind: 'equalDOF', args: { rNodeTag: grid[k], cNodeTag: id, dofs: [1, 2] } } })
    }
    const ea = (k: number, count: number) => (k === 0 || k === count - 1 ? opts.chordEa : opts.interiorEa)
    const layout: DiaphragmLayout = { u, v, level: z, bays: Array.from({ length: (u.length - 1) * (v.length - 1) }, () => opts.law), eaU: v.map((_, j) => ea(j, v.length)), eaV: u.map((_, i) => ea(i, u.length)) }
    const args: DiaphragmArgs = { label: `Diaphragm z = ${Number(z.toPrecision(6))}`, layout }
    b.writeRaw({ kind: 'element', entity: { id: b.model.nextIds.element, eleType: 'diaphragm', nodes: grid, args: args as unknown as Record<string, unknown> } })
    diaphragms++
    for (const load of moved.filter((l) => Math.abs((l.at[2] ?? 0) - z) <= tol)) for (const [node, values] of gridLoads(layout, grid, load.at, load.values)) {
      b.writeRaw({ kind: 'patternChild', patternId: load.patternId, child: { kind: 'load', args: { nodeTag: node, values } } })
    }
  }
  return { model: b.model, diaphragms, skipped }
}

/** Remove every flexible diaphragm that holds one of the nodes, and the grid nodes only it used (no element, constraint, load or mass,
 * and at most the out-of-plane support `assignFlexibleDiaphragms` gave them). */
export function removeFlexibleDiaphragms(model: Model, nodeIds: number[]): Model {
  const ids = new Set(nodeIds)
  const gone = [...model.elements.values()].filter((e) => isDiaphragm(e.eleType) && e.nodes.some((n) => ids.has(n)))
  if (!gone.length) return model
  const elements = new Map(model.elements)
  gone.forEach((e) => elements.delete(e.id))
  // The plan ties `assignFlexibleDiaphragms` added from a grid node to a coincident node.
  const gridNodes = new Set(gone.flatMap((e) => e.nodes))
  const mpConstraints = new Map(model.mpConstraints)
  for (const c of model.mpConstraints.values()) {
    if (c.kind !== 'equalDOF' || !gridNodes.has(Number(c.args.rNodeTag)) || JSON.stringify((c.args.dofs as number[]).map(Number)) !== '[1,2]') continue
    const a = model.nodes.get(Number(c.args.rNodeTag))?.coords, b = model.nodes.get(Number(c.args.cNodeTag))?.coords
    if (a && b && a.every((x, k) => Math.abs(x - (b[k] ?? 0)) <= mergeTolerance(model))) mpConstraints.delete(c.id)
  }
  const nodes = new Map(model.nodes), fixes = new Map(model.fixes)
  const used = new Set<number>()
  for (const e of elements.values()) e.nodes.forEach((n) => used.add(n))
  for (const c of mpConstraints.values()) [c.args.rNodeTag, c.args.cNodeTag, ...((c.args.cNodeTags as unknown[] | undefined) ?? [])].forEach((n) => used.add(Number(n)))
  for (const p of model.patterns.values()) for (const ch of p.children) if (ch.args.nodeTag !== undefined) used.add(Number(ch.args.nodeTag))
  for (const id of model.masses.keys()) used.add(id)
  for (const e of gone) for (const n of e.nodes) {
    const fix = model.fixes.get(n)?.dofs ?? []
    if (used.has(n) || !fix.every((d) => d >= 3)) continue
    nodes.delete(n); fixes.delete(n)
  }
  return { ...model, elements, nodes, fixes, mpConstraints }
}

/** A plan load (Fx, Fy and Mz of a 6-DOF vector) at `at` as statically equivalent nodal loads on a diaphragm grid: the forces split
 * bilinearly over the bay holding the point (clamped to the grid; bilinear weights keep the forces' moment), the moment as a couple of tangential forces on the four corners. */
export function gridLoads(layout: DiaphragmLayout, nodes: number[], at: number[], values: number[]): [number, number[]][] {
  const { u, v } = layout, nu = u.length
  const out = new Map<number, number[]>()
  const add = (node: number, fx: number, fy: number) => { const f = out.get(node) ?? [0, 0, 0, 0, 0, 0]; f[0] += fx; f[1] += fy; out.set(node, f) }
  const cell = (xs: number[], x: number) => { const c = Math.min(Math.max(x, xs[0]), xs[xs.length - 1]); let i = 0; while (i < xs.length - 2 && c > xs[i + 1]) i++; return { i, r: (c - xs[i]) / (xs[i + 1] - xs[i]) } }
  const a = cell(u, at[0]), c = cell(v, at[1] ?? 0)
  const [fx, fy, , , , mz] = [0, 1, 2, 3, 4, 5].map((k) => values[k] ?? 0)
  for (const [di, dj, w] of [[0, 0, (1 - a.r) * (1 - c.r)], [1, 0, a.r * (1 - c.r)], [1, 1, a.r * c.r], [0, 1, (1 - a.r) * c.r]] as const) if (w) add(nodes[a.i + di + (c.i + dj) * nu], fx * w, fy * w)
  if (mz) {
    const cx = (u[0] + u[nu - 1]) / 2, cy = (v[0] + v[v.length - 1]) / 2
    const corners = [[0, 0], [nu - 1, 0], [nu - 1, v.length - 1], [0, v.length - 1]].map(([i, j]) => ({ node: nodes[i + j * nu], rx: u[i] - cx, ry: v[j] - cy }))
    const r2 = corners.reduce((sum, k) => sum + k.rx ** 2 + k.ry ** 2, 0)
    // Each corner takes a force along z × r: the set sums to zero force and moment mz about the centre (also about any point).
    for (const k of corners) add(k.node, -mz * k.ry / r2, mz * k.rx / r2)
  }
  return [...out]
}
