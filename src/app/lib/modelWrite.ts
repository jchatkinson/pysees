import type {
  BeamIntegrationEntity, ElementEntity, FiberSectionItem, FixEntity, GeomTransfEntity,
  LoadAssignment, MPConstraintEntity, MassEntity, MaterialEntity, MiscEntity, Model,
  ModelEntityKind, NodeEntity, PatternEntity, RegionEntity, SectionEntity, TimeSeriesEntity,
} from '@/app/types/model'

/** A single change to apply to the Model — the common currency between commandSchemas' create() and the store's writeModelEntity action. */
export type ModelWrite =
  | { kind: 'node'; entity: NodeEntity }
  | { kind: 'mass'; entity: MassEntity }
  | { kind: 'material'; entity: MaterialEntity }
  | { kind: 'section'; entity: SectionEntity }
  | { kind: 'geomTransf'; entity: GeomTransfEntity }
  | { kind: 'beamIntegration'; entity: BeamIntegrationEntity }
  | { kind: 'element'; entity: ElementEntity }
  | { kind: 'fix'; entity: FixEntity }
  | { kind: 'mpConstraint'; entity: MPConstraintEntity }
  | { kind: 'region'; entity: RegionEntity }
  | { kind: 'timeSeries'; entity: TimeSeriesEntity }
  | { kind: 'pattern'; entity: PatternEntity }
  | { kind: 'misc'; entity: MiscEntity }
  | { kind: 'sectionChild'; sectionId: number; child: FiberSectionItem; childIndex?: number }
  | { kind: 'patternChild'; patternId: number; child: LoadAssignment; childIndex?: number }

export type ModelDeletableKind = Exclude<ModelWrite['kind'], 'sectionChild' | 'patternChild'>

function mapFor(model: Model, kind: ModelDeletableKind) {
  switch (kind) {
    case 'node': return model.nodes
    case 'mass': return model.masses
    case 'material': return model.materials
    case 'section': return model.sections
    case 'geomTransf': return model.geomTransfs
    case 'beamIntegration': return model.beamIntegrations
    case 'element': return model.elements
    case 'fix': return model.fixes
    case 'mpConstraint': return model.mpConstraints
    case 'region': return model.regions
    case 'timeSeries': return model.timeSeries
    case 'pattern': return model.patterns
    case 'misc': return model.misc
  }
}

function keyFor(write: Exclude<ModelWrite, { kind: 'sectionChild' | 'patternChild' }>): number {
  switch (write.kind) {
    case 'fix': return write.entity.nodeId
    case 'mass': return write.entity.nodeId
    default: return write.entity.id
  }
}

/** True when a top-level write would overwrite an entity that already has that tag (child writes never do). */
export function entityExists(model: Model, write: ModelWrite): boolean {
  if (write.kind === 'sectionChild' || write.kind === 'patternChild') return false
  return (mapFor(model, write.kind) as Map<number, unknown>).has(keyFor(write))
}

/**
 * Applies writes to a model without touching it: each map (and pattern or section) a write changes is copied the first time, then
 * changed in place, so a long run of writes costs one copy per map instead of one per write. `model` is the result so far and later
 * writes keep changing it; take it once you are done.
 */
export class ModelDraft {
  model: Model
  private owned = new Set<unknown>()
  constructor(model: Model) { this.model = { ...model, nextIds: { ...model.nextIds } } }

  private own<K extends keyof Model>(key: K): Model[K] {
    const v = this.model[key]
    if (this.owned.has(v)) return v
    const copy = new Map(v as Map<unknown, unknown>) as Model[K]
    this.owned.add(copy)
    this.model[key] = copy
    return copy
  }

  /** The parent's own copy (children included), or undefined when it does not exist. */
  private parent<E extends { children: unknown[] }>(key: 'sections' | 'patterns', id: number): E | undefined {
    const existing = this.model[key].get(id) as E | undefined
    if (!existing || this.owned.has(existing)) return existing
    const copy = { ...existing, children: [...existing.children] }
    this.owned.add(copy);
    (this.own(key) as Map<number, unknown>).set(id, copy)
    return copy
  }

  apply(write: ModelWrite): this {
    if (write.kind === 'sectionChild' || write.kind === 'patternChild') {
      const parent = this.parent<{ children: unknown[] }>(write.kind === 'sectionChild' ? 'sections' : 'patterns', write.kind === 'sectionChild' ? write.sectionId : write.patternId)
      if (parent) { if (write.childIndex !== undefined) parent.children[write.childIndex] = write.child; else parent.children.push(write.child) }
      return this
    }
    let entity: unknown = write.entity
    if (write.kind === 'pattern') {
      // Re-saving a pattern from its form rebuilds the entity without its loads or alias; carry them over.
      const prev = this.model.patterns.get(write.entity.id)
      if (prev) entity = { ...write.entity, children: write.entity.children.length ? write.entity.children : prev.children }
    }
    const id = keyFor(write);
    (this.own(mapKeyFor(write.kind)) as Map<number, unknown>).set(id, entity)
    const idKind = write.kind as ModelEntityKind
    if (idKind in this.model.nextIds && id >= this.model.nextIds[idKind]) this.model.nextIds[idKind] = id + 1
    return this
  }
}

/** Applies writes immutably, returning a new Model. Structural-shares unrelated maps. */
export function applyModelWrites(model: Model, writes: readonly ModelWrite[]): Model {
  if (!writes.length) return model
  const draft = new ModelDraft(model)
  for (const w of writes) draft.apply(w)
  return draft.model
}

/** Applies a ModelWrite immutably, returning a new Model. Structural-shares unrelated maps. */
export const applyModelWrite = (model: Model, write: ModelWrite): Model => applyModelWrites(model, [write])

function mapKeyFor(kind: ModelDeletableKind): keyof Model {
  switch (kind) {
    case 'node': return 'nodes'
    case 'mass': return 'masses'
    case 'material': return 'materials'
    case 'section': return 'sections'
    case 'geomTransf': return 'geomTransfs'
    case 'beamIntegration': return 'beamIntegrations'
    case 'element': return 'elements'
    case 'fix': return 'fixes'
    case 'mpConstraint': return 'mpConstraints'
    case 'region': return 'regions'
    case 'timeSeries': return 'timeSeries'
    case 'pattern': return 'patterns'
    case 'misc': return 'misc'
  }
}

export function removeModelChild(model: Model, parent: 'section' | 'pattern', parentId: number, childIndex: number): Model {
  if (parent === 'section') {
    const existing = model.sections.get(parentId)
    if (!existing) return model
    const children = existing.children.filter((_, i) => i !== childIndex)
    const sections = new Map(model.sections)
    sections.set(parentId, { ...existing, children })
    return { ...model, sections }
  }
  const existing = model.patterns.get(parentId)
  if (!existing) return model
  const children = existing.children.filter((_, i) => i !== childIndex)
  const patterns = new Map(model.patterns)
  patterns.set(parentId, { ...existing, children })
  return { ...model, patterns }
}

/** Everything in the model that references a given node tag — used to cascade-delete or warn. */
export function nodeReferences(model: Model, nodeId: number) {
  const elements = [...model.elements.values()].filter((e) => e.nodes.includes(nodeId))
  const fixes = model.fixes.has(nodeId) ? [model.fixes.get(nodeId)!] : []
  const masses = model.masses.has(nodeId) ? [model.masses.get(nodeId)!] : []
  const mpConstraints = [...model.mpConstraints.values()].filter((c) => {
    const args = c.args as Record<string, unknown>
    return args.rNodeTag === nodeId || args.cNodeTag === nodeId || [args.nodeTags, args.cNodeTags].some((l) => Array.isArray(l) && (l as number[]).includes(nodeId))
  })
  return { elements, fixes, masses, mpConstraints }
}

export function deleteNodeCascade(model: Model, nodeId: number): Model {
  const refs = nodeReferences(model, nodeId)
  const nodes = new Map(model.nodes); nodes.delete(nodeId)
  const fixes = new Map(model.fixes); fixes.delete(nodeId)
  const masses = new Map(model.masses); masses.delete(nodeId)
  const elements = new Map(model.elements)
  for (const e of refs.elements) elements.delete(e.id)
  const mpConstraints = new Map(model.mpConstraints)
  // A diaphragm loses just this constrained node; any other constraint on it goes.
  for (const c of refs.mpConstraints) {
    const rest = c.args.rNodeTag !== nodeId && Array.isArray(c.args.cNodeTags) ? (c.args.cNodeTags as number[]).filter((n) => n !== nodeId) : []
    if (rest.length) mpConstraints.set(c.id, { ...c, args: { ...c.args, cNodeTags: rest } }); else mpConstraints.delete(c.id)
  }
  return { ...model, nodes, fixes, masses, elements, mpConstraints }
}

export function deleteMaterialCascade(model: Model, materialId: number): Model {
  const materials = new Map(model.materials); materials.delete(materialId)
  const elements = new Map(model.elements)
  for (const [id, e] of model.elements) {
    if ((e.args as Record<string, unknown>).matTag === materialId) elements.delete(id)
  }
  return { ...model, materials, elements }
}

export function deleteSectionCascade(model: Model, sectionId: number): Model {
  const sections = new Map(model.sections); sections.delete(sectionId)
  const elements = new Map(model.elements)
  for (const [id, e] of model.elements) {
    if ((e.args as Record<string, unknown>).secTag === sectionId) elements.delete(id)
  }
  return { ...model, sections, elements }
}

export function deleteTimeSeriesCascade(model: Model, tsId: number): Model {
  const timeSeries = new Map(model.timeSeries); timeSeries.delete(tsId)
  return { ...model, timeSeries } // patterns referencing this tag are left dangling (warn-only, see validateModelWrite)
}

export function deleteEntity(model: Model, kind: ModelDeletableKind, id: number): Model {
  if (kind === 'node') return deleteNodeCascade(model, id)
  if (kind === 'material') return deleteMaterialCascade(model, id)
  if (kind === 'section') return deleteSectionCascade(model, id)
  if (kind === 'timeSeries') return deleteTimeSeriesCascade(model, id)
  const map = mapFor(model, kind)
  const next = new Map(map as Map<number, unknown>)
  next.delete(id)
  return { ...model, [mapKeyFor(kind)]: next }
}

/** Preview of what deleting an entity would also remove, for a confirmation dialog. */
export function previewDeleteEntity(model: Model, kind: ModelDeletableKind, id: number): string[] {
  if (kind === 'node') {
    const refs = nodeReferences(model, id)
    const lines: string[] = []
    for (const e of refs.elements) lines.push(`element ${e.id} (${e.eleType})`)
    for (const f of refs.fixes) lines.push(`fix on node ${f.nodeId}`)
    for (const m of refs.masses) lines.push(`mass on node ${m.nodeId}`)
    for (const c of refs.mpConstraints) lines.push(`constraint ${c.id} (${c.kind})`)
    return lines
  }
  if (kind === 'material') {
    return [...model.elements.values()].filter((e) => (e.args as Record<string, unknown>).matTag === id).map((e) => `element ${e.id} (${e.eleType})`)
  }
  if (kind === 'section') {
    return [...model.elements.values()].filter((e) => (e.args as Record<string, unknown>).secTag === id).map((e) => `element ${e.id} (${e.eleType})`)
  }
  return []
}
