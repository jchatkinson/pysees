import type { ElementEntity, Model, NodeEntity } from '@/app/types/model'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { ModelDraft } from '@/app/lib/modelWrite'
import { isShell } from '@/app/lib/commands/tables'
import type { DrawTemplate } from './properties'
import type { LevelEntity } from '@/app/types/levels'
import { levelElevations } from '@/app/lib/levels'

export type P3 = [number, number, number]

/** Coincidence tolerance for merging drawn points into existing nodes: relative to the model's size. */
export function mergeTolerance(model: Model): number {
  let extent = 0
  for (const n of model.nodes.values()) for (const c of n.coords) extent = Math.max(extent, Math.abs(c))
  return 1e-6 * Math.max(1, extent)
}

/**
 * Accumulates the writes of one draw action against a working copy of the model, so later steps see earlier ones (a node made for
 * the first member is reused by the second). `writes` is then committed as one undo step.
 */
export class DrawBatch {
  model: Model
  readonly writes: ModelWrite[] = []
  private readonly tol: number
  private readonly draft: ModelDraft
  constructor(model: Model) { this.model = model; this.draft = new ModelDraft(model); this.tol = mergeTolerance(model) }

  private write(w: ModelWrite) { this.writes.push(w); this.model = this.draft.apply(w).model }
  /** Any other write, kept in this batch (copies of existing entities). */
  writeRaw(w: ModelWrite) { this.write(w) }

  /** The node at `p` (within tolerance), or a new one. Coordinates are trimmed to the model's dimension. */
  node(p: P3): number {
    const ndm = this.model.config?.ndm ?? 3
    const c = p.slice(0, ndm)
    for (const n of this.model.nodes.values()) if (c.every((v, i) => Math.abs(v - (n.coords[i] ?? 0)) <= this.tol)) return n.id
    const id = this.model.nextIds.node
    this.write({ kind: 'node', entity: { id, coords: c.map((v) => (Math.abs(v) < this.tol ? 0 : v)) } })
    return id
  }

  /**
   * A transform for a member along `dir`: an existing one of `transfType` with a parallel `vecxz` (any one in 2D), or a new one.
   * The default `vecxz` follows `memberFrame`: global X for vertical members, global Z otherwise.
   */
  transform(dir: P3, transfType: string): number {
    const ndm = this.model.config?.ndm ?? 3
    const len = Math.hypot(...dir) || 1
    const vertical = Math.abs(dir[2] / len) > 0.999
    const vecxz: P3 = vertical ? [1, 0, 0] : [0, 0, 1]
    for (const t of [...this.model.geomTransfs.values()].sort((a, b) => a.id - b.id)) {
      if (t.transfType !== transfType) continue
      if (ndm === 2) return t.id
      const v = Array.isArray(t.args.vecxz) ? (t.args.vecxz as unknown[]).map(Number) : null
      if (!v || v.length !== 3) continue
      const vl = Math.hypot(v[0], v[1], v[2]) || 1
      if (Math.abs((v[0] * vecxz[0] + v[1] * vecxz[1] + v[2] * vecxz[2]) / vl) > 1 - 1e-9 && Math.abs(v.reduce((s, x, i) => s + x * dir[i], 0) / (vl * len)) < 0.999) return t.id
    }
    const id = this.model.nextIds.geomTransf
    this.write({ kind: 'geomTransf', entity: { id, transfType, args: { type: transfType, transfTag: id, ...(ndm === 3 ? { vecxz } : {}) } } })
    return id
  }

  /** A member of `template` from `a` to `b` (skipped if it has no length or already exists between those nodes). */
  member(template: DrawTemplate, a: P3, b: P3, transfType = 'Linear'): number | null {
    const i = this.node(a), j = this.node(b)
    if (i === j) return null
    for (const e of this.model.elements.values()) if (e.nodes.length === 2 && ((e.nodes[0] === i && e.nodes[1] === j) || (e.nodes[0] === j && e.nodes[1] === i))) return null
    const args = { ...template.args }
    if (needsTransform(template.eleType)) args.transfTag = this.transform([b[0] - a[0], b[1] - a[1], b[2] - a[2]], transfType)
    const id = this.model.nextIds.element
    this.write({ kind: 'element', entity: { id, eleType: template.eleType, nodes: [i, j], args } })
    return id
  }

  /** A shell over `corners` (3 or 4 points), unless one already joins exactly those nodes. */
  shell(template: DrawTemplate, corners: P3[]): number | null {
    const ids = corners.map((p) => this.node(p))
    if (new Set(ids).size !== ids.length) return null
    const key = [...ids].sort((x, y) => x - y).join(',')
    for (const e of this.model.elements.values()) if ([...e.nodes].sort((x, y) => x - y).join(',') === key) return null
    const id = this.model.nextIds.element
    this.write({ kind: 'element', entity: { id, eleType: template.eleType, nodes: ids, args: { ...template.args } } })
    return id
  }

  /** Give an existing two-node element a new property, with a transform for its direction when the new type needs one. */
  reassign(elementId: number, template: DrawTemplate, transfType = 'Linear'): boolean {
    const e = this.model.elements.get(elementId)
    if (!e || e.nodes.length !== 2) return false
    const a = this.model.nodes.get(e.nodes[0]), b = this.model.nodes.get(e.nodes[1])
    if (!a || !b) return false
    const args = { ...template.args }
    if (needsTransform(template.eleType)) {
      const old = Number(e.args.transfTag)
      args.transfTag = this.model.geomTransfs.has(old) && this.model.geomTransfs.get(old)!.transfType === transfType ? old
        : this.transform([b.coords[0] - a.coords[0], (b.coords[1] ?? 0) - (a.coords[1] ?? 0), (b.coords[2] ?? 0) - (a.coords[2] ?? 0)], transfType)
    }
    this.write({ kind: 'element', entity: { ...e, eleType: template.eleType, args } })
    return true
  }

  support(nodeId: number, dofs: number[]) { this.write({ kind: 'fix', entity: { nodeId, dofs } }) }
}

export const needsTransform = (eleType: string) => eleType === 'ElasticBeamColumn' || eleType === 'DispBeamColumn' || eleType === 'ForceBeamColumn'
export const isFrameTemplate = (t: DrawTemplate) => !isShell(t.eleType) && !/^zeroLength/.test(t.eleType)

/** The transform type most used by a property's elements, so new members match (Linear when none). */
export function transfTypeFor(model: Model, elements: ElementEntity[]): string {
  const count = new Map<string, number>()
  for (const e of elements) {
    const t = model.geomTransfs.get(Number(e.args.transfTag))
    if (t) count.set(t.transfType, (count.get(t.transfType) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Linear'
}

/** Support presets as fixed DOF indices (1-based) for the model's dimension. */
export function supportDofs(preset: 'fixed' | 'pinned' | 'roller', ndm: 2 | 3, ndf: number): number[] {
  if (preset === 'fixed') return Array.from({ length: ndf }, (_, i) => i + 1)
  if (preset === 'pinned') return Array.from({ length: Math.min(ndm, ndf) }, (_, i) => i + 1)
  return [ndm === 3 ? 3 : 2]
}

export const coordsOf = (n: NodeEntity): P3 => [n.coords[0] ?? 0, n.coords[1] ?? 0, n.coords[2] ?? 0]

/**
 * Map a point drawn on plan level `i` to level `j`: points at level i go to level j, points at the level below i (a column's foot) go to
 * the level below j, anything else shifts by the difference between the two levels. Stories of different heights stay consistent.
 */
export function storyMap(levels: LevelEntity[], i: number, j: number): (p: P3) => P3 {
  const z = [0, ...levelElevations(levels)] // z[k + 1] is level k; z[0] is the base
  const top = z[i + 1], below = z[i], tol = 1e-9 * Math.max(1, Math.abs(top))
  return ([x, y, zz]) => [x, y, Math.abs(zz - top) <= tol ? z[j + 1] : Math.abs(zz - below) <= tol ? z[j] : zz + z[j + 1] - top]
}
