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

/** Applies a ModelWrite immutably, returning a new Model. Structural-shares unrelated maps. */
export function applyModelWrite(model: Model, write: ModelWrite): Model {
  if (write.kind === 'sectionChild') {
    const existing = model.sections.get(write.sectionId)
    if (!existing) return model
    const children = [...existing.children]
    if (write.childIndex !== undefined) children[write.childIndex] = write.child
    else children.push(write.child)
    const sections = new Map(model.sections)
    sections.set(write.sectionId, { ...existing, children })
    return { ...model, sections }
  }
  if (write.kind === 'patternChild') {
    const existing = model.patterns.get(write.patternId)
    if (!existing) return model
    const children = [...existing.children]
    if (write.childIndex !== undefined) children[write.childIndex] = write.child
    else children.push(write.child)
    const patterns = new Map(model.patterns)
    patterns.set(write.patternId, { ...existing, children })
    return { ...model, patterns }
  }
  const map = mapFor(model, write.kind)
  const next = new Map(map as Map<number, unknown>)
  next.set(keyFor(write), write.entity)
  const nextIds = { ...model.nextIds }
  const idKind = write.kind as ModelEntityKind
  if (idKind in nextIds) {
    const id = keyFor(write)
    if (id >= nextIds[idKind]) nextIds[idKind] = id + 1
  }
  return { ...model, [mapKeyFor(write.kind)]: next, nextIds }
}

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
    return args.rNodeTag === nodeId || args.cNodeTag === nodeId || (Array.isArray(args.nodeTags) && (args.nodeTags as number[]).includes(nodeId))
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
  for (const c of refs.mpConstraints) mpConstraints.delete(c.id)
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
