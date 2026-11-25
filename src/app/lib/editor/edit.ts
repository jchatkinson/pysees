import type { ElementEntity, LoadAssignment, Model, PatternEntity } from '@/app/types/model'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { DrawBatch, coordsOf, mergeTolerance, type P3 } from './draw'

/** A point mapping for move / copy / mirror. */
export type Xform = (p: P3) => P3
export const translate = (d: P3): Xform => (p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]
/** Reflection across the plane `axis = c` (axis 0 = X, 1 = Y, 2 = Z). */
export const mirror = (axis: 0 | 1 | 2, c: number): Xform => (p) => p.map((v, i) => (i === axis ? 2 * c - v : v)) as P3

export interface Selection { nodes: number[]; elements: number[] }

/** The nodes a selection moves: the selected nodes and every node of the selected elements. */
export function touchedNodes(model: Model, sel: Selection): number[] {
  const out = new Set(sel.nodes.filter((id) => model.nodes.has(id)))
  for (const id of sel.elements) for (const n of model.elements.get(id)?.nodes ?? []) out.add(n)
  return [...out]
}

const clean = (v: number) => Number(v.toPrecision(12))

/** Move the selection in place (only its nodes change). Members attached to the moved nodes from outside stretch to follow. */
export function moveSelection(model: Model, sel: Selection, xf: Xform): Model {
  const ndm = model.config?.ndm ?? 3
  let m = model
  for (const id of touchedNodes(model, sel)) {
    const n = model.nodes.get(id)!
    m = applyModelWrite(m, { kind: 'node', entity: { id, coords: xf(coordsOf(n)).slice(0, ndm).map(clean) } })
  }
  return m
}

/**
 * Copy the selection `count` times, applying `xf` once more for each copy (a linear replicate when `xf` is a translation; one mirrored
 * copy when it is a reflection). New nodes merge with existing ones; a copied node keeps the original's support and mass; an element
 * already joining the same nodes is skipped. Returns the new model and the ids of the copied elements and free nodes.
 */
export function copySelection(model: Model, sel: Selection, xf: Xform, count = 1): { model: Model; elements: number[]; nodes: number[] } {
  const b = new DrawBatch(model)
  const newElements: number[] = [], newNodes: number[] = []
  const elements = sel.elements.map((id) => model.elements.get(id)).filter((e): e is ElementEntity => !!e)
  const free = sel.nodes.filter((id) => model.nodes.has(id) && !elements.some((e) => e.nodes.includes(id)))
  for (let k = 1; k <= count; k++) {
    const map = new Map<number, number>()
    const at = (id: number) => {
      let out = map.get(id)
      if (out !== undefined) return out
      let p = coordsOf(model.nodes.get(id)!)
      for (let i = 0; i < k; i++) p = xf(p)
      const before = b.model.nodes.size
      out = b.node(p.map(clean) as P3)
      if (b.model.nodes.size > before) {
        const fix = model.fixes.get(id), mass = model.masses.get(id)
        if (fix) b.support(out, [...fix.dofs])
        if (mass) b.writeRaw({ kind: 'mass', entity: { nodeId: out, values: [...mass.values] } })
      }
      map.set(id, out)
      return out
    }
    for (const e of elements) {
      const nodes = e.nodes.map(at)
      if (new Set(nodes).size !== nodes.length) continue
      const key = [...nodes].sort((x, y) => x - y).join(',')
      if ([...b.model.elements.values()].some((o) => [...o.nodes].sort((x, y) => x - y).join(',') === key)) continue
      const id = b.model.nextIds.element
      b.writeRaw({ kind: 'element', entity: { id, eleType: e.eleType, nodes, args: { ...e.args } } })
      newElements.push(id)
    }
    for (const id of free) newNodes.push(at(id))
  }
  return { model: b.model, elements: newElements, nodes: newNodes }
}

/** Replace element `old` by `parts` in every element-load assignment that lists it. */
function remapEleLoads(model: Model, old: number, parts: number[]): Model {
  let patterns: Map<number, PatternEntity> | null = null
  for (const p of model.patterns.values()) {
    let changed = false
    const children: LoadAssignment[] = p.children.map((c) => {
      const tags = c.kind === 'eleLoad' && Array.isArray(c.args.eleTags) ? (c.args.eleTags as number[]) : null
      if (!tags || !tags.includes(old)) return c
      changed = true
      return { ...c, args: { ...c.args, eleTags: tags.flatMap((t) => (t === old ? parts : [t])) } }
    })
    if (changed) { patterns ??= new Map(model.patterns); patterns.set(p.id, { ...p, children }) }
  }
  return patterns ? { ...model, patterns } : model
}

/**
 * Split each selected two-node member into `n` equal members of the same type and args (new nodes along it, merged with any already
 * there). Element loads on a split member move to its parts. Returns the new model and the ids that replaced the selection.
 */
export function divideMembers(model: Model, elementIds: number[], n: number): { model: Model; elements: number[] } {
  if (n < 2) return { model, elements: elementIds }
  let m = model
  const out: number[] = []
  for (const id of elementIds) {
    const e = m.elements.get(id)
    if (!e || e.nodes.length !== 2) { if (e) out.push(id); continue }
    const a = coordsOf(m.nodes.get(e.nodes[0])!), z = coordsOf(m.nodes.get(e.nodes[1])!)
    const b = new DrawBatch(m)
    const ids = [e.nodes[0]]
    for (let k = 1; k < n; k++) ids.push(b.node(a.map((v, i) => clean(v + ((z[i] - v) * k) / n)) as P3))
    ids.push(e.nodes[1])
    const parts: number[] = []
    for (let k = 0; k < n; k++) {
      const pid = k === 0 ? id : b.model.nextIds.element
      b.writeRaw({ kind: 'element', entity: { ...e, id: pid, nodes: [ids[k], ids[k + 1]], args: { ...e.args } } })
      parts.push(pid)
    }
    m = remapEleLoads(b.model, id, parts)
    out.push(...parts)
  }
  return { model: m, elements: out }
}

/**
 * Merge nodes that coincide (within the model's merge tolerance) among `nodeIds`, or all nodes when omitted. The lowest id survives; members,
 * supports (DOFs combined), masses (summed), nodal loads and constraints move to it; members that collapse or duplicate another are removed.
 */
export function mergeNodes(model: Model, nodeIds?: number[]): { model: Model; merged: number } {
  const tol = mergeTolerance(model)
  const ids = (nodeIds ?? [...model.nodes.keys()]).filter((id) => model.nodes.has(id)).sort((x, y) => x - y)
  const cell = (v: number) => Math.round(v / (tol * 10))
  const buckets = new Map<string, number[]>()
  const keep = new Map<number, number>() // removed -> survivor
  for (const id of ids) {
    const p = coordsOf(model.nodes.get(id)!)
    let survivor: number | undefined
    for (let dx = -1; dx <= 1 && survivor === undefined; dx++) for (let dy = -1; dy <= 1 && survivor === undefined; dy++) for (let dz = -1; dz <= 1 && survivor === undefined; dz++) {
      for (const o of buckets.get(`${cell(p[0]) + dx},${cell(p[1]) + dy},${cell(p[2]) + dz}`) ?? []) {
        const q = coordsOf(model.nodes.get(o)!)
        if (Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol) { survivor = o; break }
      }
    }
    if (survivor !== undefined) { keep.set(id, survivor); continue }
    const k = `${cell(p[0])},${cell(p[1])},${cell(p[2])}`
    buckets.set(k, [...(buckets.get(k) ?? []), id])
  }
  if (keep.size === 0) return { model, merged: 0 }
  const to = (id: number) => keep.get(id) ?? id

  const nodes = new Map(model.nodes), fixes = new Map(model.fixes), masses = new Map(model.masses)
  for (const [gone, s] of keep) {
    nodes.delete(gone)
    const f = fixes.get(gone)
    if (f) { const sf = fixes.get(s); fixes.set(s, { nodeId: s, dofs: [...new Set([...(sf?.dofs ?? []), ...f.dofs])].sort((x, y) => x - y) }); fixes.delete(gone) }
    const ms = masses.get(gone)
    if (ms) { const sm = masses.get(s); masses.set(s, { nodeId: s, values: ms.values.map((v, i) => v + (sm?.values[i] ?? 0)) }); masses.delete(gone) }
  }
  const elements = new Map<number, ElementEntity>()
  const seen = new Set<string>()
  for (const e of [...model.elements.values()].sort((x, y) => x.id - y.id)) {
    const ns = e.nodes.map(to)
    const key = `${e.eleType}|${[...ns].sort((x, y) => x - y).join(',')}`
    const changed = ns.some((n, i) => n !== e.nodes[i])
    // Only members touching a merged node can collapse or become duplicates; anything else is left exactly as it was.
    if (changed && new Set(ns).size !== ns.length && !/^zeroLength/.test(e.eleType)) continue
    if (changed && seen.has(key)) continue
    seen.add(key)
    elements.set(e.id, changed ? { ...e, nodes: ns } : e)
  }
  const remapNode = (v: unknown) => (typeof v === 'number' ? to(v) : Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? to(x) : x)) : v)
  const patterns = new Map([...model.patterns].map(([id, p]) => [id, { ...p, children: p.children.map((c) => (c.kind === 'load' || c.kind === 'sp' ? { ...c, args: { ...c.args, nodeTag: remapNode(c.args.nodeTag) } } : c)) }]))
  const mpConstraints = new Map([...model.mpConstraints].map(([id, c]) => [id, { ...c, args: Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, /node/i.test(k) ? remapNode(v) : v])) }]))
  return { model: { ...model, nodes, fixes, masses, elements, patterns, mpConstraints }, merged: keep.size }
}

/** Writes adding a nodal load (`values` per DOF) on each node to a pattern. */
export function nodalLoadWrites(patternId: number, nodeIds: number[], values: number[]) {
  return nodeIds.map((nodeTag) => ({ kind: 'patternChild' as const, patternId, child: { kind: 'load' as const, args: { nodeTag, values: [...values] } } }))
}

/** A write adding one uniform member load (local wy, wz, wx) on the members to a pattern. */
export function memberLoadWrite(patternId: number, eleTags: number[], w: { wy: number; wz: number; wx: number }, ndm: 2 | 3) {
  const args: Record<string, unknown> = { eleTags: [...eleTags], wy: w.wy, wx: w.wx }
  if (ndm === 3) args.wz = w.wz
  return { kind: 'patternChild' as const, patternId, child: { kind: 'eleLoad' as const, args } }
}

const diaphragmNodes = (c: { kind: string; args: Record<string, unknown> }) => (c.kind === 'rigidDiaphragm' ? [Number(c.args.rNodeTag), ...((c.args.cNodeTags as number[] | undefined) ?? []).map(Number)] : [])

/**
 * One rigid diaphragm (perpendicular to Z) per level among the selected nodes of a 3D model. Each level's retained node is a node at the
 * centroid of that level's nodes (an existing node there, or a new one with its out-of-plane DOFs fixed). Nodes with a fixed in-plane DOF
 * are left out (a constrained DOF can't also be fixed), and any diaphragm already holding one of the nodes is replaced.
 */
export function assignDiaphragms(model: Model, nodeIds: number[]): { model: Model; diaphragms: number; skipped: number } {
  const tol = mergeTolerance(model)
  const ids = new Set(nodeIds.filter((id) => model.nodes.has(id)))
  let m = model
  for (const c of model.mpConstraints.values()) if (diaphragmNodes(c).some((n) => ids.has(n))) { const next = new Map(m.mpConstraints); next.delete(c.id); m = { ...m, mpConstraints: next } }
  let skipped = 0
  const levels: { z: number; nodes: number[] }[] = []
  for (const id of ids) {
    if (m.fixes.get(id)?.dofs.some((d) => d === 1 || d === 2 || d === 6)) { skipped++; continue }
    const z = m.nodes.get(id)!.coords[2] ?? 0
    const level = levels.find((l) => Math.abs(l.z - z) <= tol)
    if (level) level.nodes.push(id); else levels.push({ z, nodes: [id] })
  }
  const b = new DrawBatch(m)
  let diaphragms = 0
  for (const { z, nodes } of levels) {
    if (nodes.length < 2) { skipped += nodes.length; continue }
    const c = (k: number) => clean(nodes.reduce((s, id) => s + m.nodes.get(id)!.coords[k], 0) / nodes.length)
    const before = b.model.nodes.size
    const master = b.node([c(0), c(1), z])
    const isNew = b.model.nodes.size > before
    if (isNew || (![...b.model.elements.values()].some((e) => e.nodes.includes(master)) && !b.model.fixes.has(master))) b.support(master, [3, 4, 5])
    const cNodeTags = nodes.filter((id) => id !== master)
    b.writeRaw({ kind: 'mpConstraint', entity: { id: b.model.nextIds.mpConstraint, kind: 'rigidDiaphragm', args: { perpDirn: 3, rNodeTag: master, cNodeTags } } })
    diaphragms++
  }
  return { model: b.model, diaphragms, skipped }
}

/** Remove every diaphragm that holds one of the nodes, and its retained node when nothing else uses it (no element, load, mass or other constraint). */
export function removeDiaphragms(model: Model, nodeIds: number[]): Model {
  const ids = new Set(nodeIds)
  const gone = [...model.mpConstraints.values()].filter((c) => diaphragmNodes(c).some((n) => ids.has(n)))
  if (!gone.length) return model
  const mpConstraints = new Map(model.mpConstraints)
  for (const c of gone) mpConstraints.delete(c.id)
  let m: Model = { ...model, mpConstraints }
  const loaded = new Set<number>()
  for (const p of m.patterns.values()) for (const ch of p.children) if (ch.kind !== 'eleLoad' && ch.args.nodeTag !== undefined) loaded.add(Number(ch.args.nodeTag))
  for (const c of gone) {
    const r = Number(c.args.rNodeTag)
    const used = loaded.has(r) || m.masses.has(r) || [...m.elements.values()].some((e) => e.nodes.includes(r))
      || [...m.mpConstraints.values()].some((o) => diaphragmNodes(o).includes(r) || o.args.rNodeTag === r || o.args.cNodeTag === r)
    if (!used && !ids.has(r)) {
      const nodes = new Map(m.nodes), fixes = new Map(m.fixes)
      nodes.delete(r); fixes.delete(r)
      m = { ...m, nodes, fixes }
    }
  }
  return m
}
