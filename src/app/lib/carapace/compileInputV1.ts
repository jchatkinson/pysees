import type { Model, MaterialEntity, BeamIntegrationEntity } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { AlgorithmKind, AnalysisStage } from '@/app/types/analysisSequence'
import type * as W from '@/app/types/carapaceInputV1'
import { compileAnalysisSequence, type CompileDiagnostic } from '@/app/lib/compileAnalysisSequence'

export interface CompileInputV1Result {
  input: W.CarapaceInputV1 | null
  diagnostics: CompileDiagnostic[]
  /** Node tags recorded for displacement, in the order they occupy the dense results-storage
   * layout (carapace/docs/results-storage-indexeddb.md) — `recordedNodeTags[i]` is nodeIndex `i`. */
  recordedNodeTags: number[]
  /** The model's ndf — every recorded node's fixed component width in that dense layout. */
  dofsPerNode: number
  /** Every stored recorder, in wire-recorder (= results-column) order: node displacements first,
   * then support reactions, then element forces. Each one owns `componentLayout.length`
   * consecutive columns starting at `columnOffset` (after the leading pseudo-time column). */
  recorderPlans: RecorderPlan[]
}

export type RecorderPlanKind = 'disp' | 'reaction' | 'force'
export interface RecorderPlan {
  recorderId: string
  kind: RecorderPlanKind
  /** Node tag (disp/reaction) or element tag (force). */
  targetTag: number
  columnOffset: number
  componentLayout: string[]
}

/** Local nodal force components of a planar element (`ElementOps::local_force`), in order. */
const ELEMENT_FORCE_LABELS = ['Ni', 'Vi', 'Mi', 'Nj', 'Vj', 'Mj']
/** Appended to a loaded element's force columns: the uniform load it carries at each sample (local axes), so a
 * consumer can recover internal forces between the ends. Absent for unloaded elements. */
export const ELEMENT_LOAD_LABELS = ['wx', 'wy']

/** Names a node's `ndf` DOF components from `[x, y, z, rx, ry, rz]`-ordered labels. Planar (ndm=2)
 * nodes with a rotation DOF skip the out-of-plane entries (x, y, rz); anything else unrecognised
 * falls back to `dof<i>`. */
function dofLabels(ndm: number, ndf: number, names: string[]): string[] {
  const [x, y, z, rx, ry, rz] = names
  const layout = ndm === 2
    ? (ndf === 2 ? [x, y] : ndf === 3 ? [x, y, rz] : [])
    : (ndf === 3 ? [x, y, z] : ndf === 6 ? [x, y, z, rx, ry, rz] : [])
  return Array.from({ length: ndf }, (_, i) => layout[i] ?? `dof${i}`)
}

export function recorderIdFor(kind: RecorderPlanKind, tag: number): string {
  return kind === 'disp' ? String(tag) : `${kind}:${tag}`
}

const NO_INDEX = -1

/** Compiles a pysees Model + AnalysisHistory into the CarapaceInputV1 shape decodeInput() expects.
 * Scope (matches carapace-wasm's current decoder): planar (ndm=2/ndf=3) only, Truss/ElasticBeamColumn
 * elements, static stages only, node displacement/reaction and element force recorders. Everything outside that is
 * reported as a diagnostic and dropped, never guessed at — this is the full validation boundary
 * pysees-handoff.md assigns to the compiler. */
export function compileInputV1(model: Model, analysisHistory: AnalysisHistory): CompileInputV1Result {
  const diagnostics: CompileDiagnostic[] = []
  const fail = (message: string): CompileInputV1Result => {
    diagnostics.push({ severity: 'error', message, commandIndex: -1 })
    return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans: [] }
  }

  if (!model.config) return fail('Model is not initialized.')
  if (model.config.ndm !== 2 || model.config.ndf !== 3) {
    return fail(`Only planar models (ndm=2, ndf=3) are supported by Carapace today — this model is ndm=${model.config.ndm}, ndf=${model.config.ndf}.`)
  }

  const { sequence, diagnostics: seqDiagnostics } = compileAnalysisSequence(analysisHistory, model)
  diagnostics.push(...seqDiagnostics)

  // --- nodes ---
  const nodeIds = [...model.nodes.keys()].sort((a, b) => a - b)
  const nodeIndex = new Map(nodeIds.map((id, i) => [id, i]))
  const resolveNode = (id: number, context: string): number => {
    const idx = nodeIndex.get(id)
    if (idx === undefined) {
      diagnostics.push({ severity: 'error', message: `${context} references unknown node ${id}`, commandIndex: -1 })
      return NO_INDEX
    }
    return idx
  }

  const coords: number[] = []
  const fixed: number[] = []
  for (const id of nodeIds) {
    const node = model.nodes.get(id)!
    coords.push(node.coords[0] ?? 0, node.coords[1] ?? 0)
    const fix = model.fixes.get(id)
    let bits = 0
    if (fix) for (const dof of fix.dofs) if (dof >= 1 && dof <= 3) bits |= 1 << (dof - 1)
    fixed.push(bits)
  }
  const massNodeIndex: number[] = []
  const mass: number[] = []
  for (const m of model.masses.values()) {
    const idx = nodeIndex.get(m.nodeId)
    if (idx === undefined) continue
    massNodeIndex.push(idx)
    mass.push(m.values[0] ?? 0, m.values[1] ?? 0, m.values[2] ?? 0)
  }
  const nodes: W.NodeTable = { coords, fixed, massNodeIndex, mass }

  // --- materials arena ---
  const matIds = [...model.materials.keys()].sort((a, b) => a - b)
  const matIndex = new Map(matIds.map((id, i) => [id, i]))
  const materials: W.MaterialSpec[] = matIds.map((id) => compileMaterial(model.materials.get(id)!, diagnostics))
  const resolveMaterial = (matTag: number | undefined, context: string): number => {
    if (matTag === undefined) {
      diagnostics.push({ severity: 'error', message: `${context} has no material assigned`, commandIndex: -1 })
      return NO_INDEX
    }
    const idx = matIndex.get(matTag)
    if (idx === undefined) {
      diagnostics.push({ severity: 'error', message: `${context} references unknown material ${matTag}`, commandIndex: -1 })
      return NO_INDEX
    }
    return idx
  }

  // --- fiber sections (zeroLengthSection's own section, or a DispBeamColumn/ForceBeamColumn's
  // beamIntegration-referenced one) — compiled once per `model.sections` entry, up front, so
  // both element loops below can resolve a `secTag` to a `fibers`-table offset by simple lookup. ---
  const { fibers, sectionIndex } = compileFiberSections(model, resolveMaterial, diagnostics)

  // --- elements ---
  const trusses: W.TrussTable = { nodeI: [], nodeJ: [], area: [], material: [], density: [] }
  const elasticBeamColumns: W.ElasticBeamColumnTable = { nodeI: [], nodeJ: [], e: [], a: [], iz: [], transform: [], density: [] }
  const dispBeamColumns: W.FiberBeamColumnTable = { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] }
  const zeroLengthSections: W.ZeroLengthSectionTable = { nodeI: [], nodeJ: [], fiberSection: [], materials: [] }
  const resolveSection = (secTag: number, context: string): number => {
    const idx = sectionIndex.get(secTag)
    if (idx === undefined) {
      diagnostics.push({ severity: 'error', message: `${context} references unknown or unsupported section ${secTag}`, commandIndex: -1 })
      return NO_INDEX
    }
    return idx
  }
  const elementRefs = new Map<number, { kind: W.ElementKind; index: number }>()
  for (const ele of [...model.elements.values()].sort((a, b) => a.id - b.id)) {
    if (ele.eleType === 'Truss') {
      trusses.nodeI.push(resolveNode(ele.nodes[0], `Truss ${ele.id}`))
      trusses.nodeJ.push(resolveNode(ele.nodes[1], `Truss ${ele.id}`))
      trusses.area.push(Number(ele.args.A) || 0)
      trusses.material.push(resolveMaterial(Number(ele.args.matTag), `Truss ${ele.id}`))
      trusses.density.push(Number(ele.args.rho) || 0)
      elementRefs.set(ele.id, { kind: 'truss', index: trusses.nodeI.length - 1 })
    } else if (ele.eleType === 'ElasticBeamColumn') {
      const transfTag = Number(ele.args.transfTag)
      const transfType = model.geomTransfs.get(transfTag)?.transfType
      elasticBeamColumns.nodeI.push(resolveNode(ele.nodes[0], `ElasticBeamColumn ${ele.id}`))
      elasticBeamColumns.nodeJ.push(resolveNode(ele.nodes[1], `ElasticBeamColumn ${ele.id}`))
      elasticBeamColumns.e.push(Number(ele.args.E) || 0)
      elasticBeamColumns.a.push(Number(ele.args.A) || 0)
      elasticBeamColumns.iz.push(Number(ele.args.Iz) || 0)
      elasticBeamColumns.transform.push(compileTransform(transfType, `ElasticBeamColumn ${ele.id}`, diagnostics))
      elasticBeamColumns.density.push(0)
      elementRefs.set(ele.id, { kind: 'elasticBeamColumn', index: elasticBeamColumns.nodeI.length - 1 })
    } else if (ele.eleType === 'DispBeamColumn') {
      const integrationTag = Number(ele.args.integrationTag)
      const integration = model.beamIntegrations.get(integrationTag)
      if (!integration) {
        diagnostics.push({ severity: 'error', message: `DispBeamColumn ${ele.id} references unknown beamIntegration ${integrationTag}`, commandIndex: -1 })
        continue
      }
      const secIdx = resolveSection(Number(integration.args.secTag), `DispBeamColumn ${ele.id}`)
      dispBeamColumns.nodeI.push(resolveNode(ele.nodes[0], `DispBeamColumn ${ele.id}`))
      dispBeamColumns.nodeJ.push(resolveNode(ele.nodes[1], `DispBeamColumn ${ele.id}`))
      dispBeamColumns.fiberSection.push(secIdx)
      dispBeamColumns.integration.push(compileIntegration(integration, `DispBeamColumn ${ele.id}`, diagnostics))
      dispBeamColumns.corotational.push(false)
      dispBeamColumns.density.push(0)
      elementRefs.set(ele.id, { kind: 'dispBeamColumn', index: dispBeamColumns.nodeI.length - 1 })
    } else if (ele.eleType === 'zeroLengthSection') {
      const secIdx = resolveSection(Number(ele.args.secTag), `ZeroLengthSection ${ele.id}`)
      zeroLengthSections.nodeI.push(resolveNode(ele.nodes[0], `ZeroLengthSection ${ele.id}`))
      zeroLengthSections.nodeJ.push(resolveNode(ele.nodes[1], `ZeroLengthSection ${ele.id}`))
      zeroLengthSections.fiberSection.push(secIdx)
      elementRefs.set(ele.id, { kind: 'zeroLengthSection', index: zeroLengthSections.nodeI.length - 1 })
    } else {
      diagnostics.push({ severity: 'warning', message: `Element ${ele.id} (${ele.eleType}) is not yet supported by the Carapace compiler and was skipped`, commandIndex: -1 })
    }
  }

  // --- load patterns + nodal loads ---
  const patternIds = [...model.patterns.keys()].sort((a, b) => a - b)
  const patternIndex = new Map(patternIds.map((id, i) => [id, i]))
  const series: W.TimeSeriesSpec[] = []
  const scaleFactor: number[] = []
  for (const id of patternIds) {
    const pattern = model.patterns.get(id)!
    const ts = model.timeSeries.get(Number(pattern.args.tsTag))
    series.push(compileTimeSeries(ts, diagnostics))
    scaleFactor.push(Number(pattern.args.fact) || 1)
  }
  const loadPatterns: W.LoadPatternTable = { series, scaleFactor }

  // Which wire stage ramps each pattern. Wire stage indices count only static stages (the only kind
  // compileStage emits). A stage's explicit `patterns` claim wins; a pattern no stage claims falls back
  // to the stage whose displacement-control node/DOF it loads (its reference-load role), else stage 0.
  const staticStages = sequence.stages.filter((st): st is Extract<AnalysisStage, { kind: 'static' }> => st.kind === 'static')
  const claimedStage = new Map<number, number>()
  staticStages.forEach((stage, stageIdx) => {
    for (const tag of stage.patterns ?? []) if (!claimedStage.has(tag)) claimedStage.set(tag, stageIdx)
  })
  const dcStageByNodeDof = new Map<string, number>()
  staticStages.forEach((stage, stageIdx) => {
    if (stage.integrator.kind === 'displacement-control') {
      dcStageByNodeDof.set(`${stage.integrator.nodeTag}:${stage.integrator.dof}`, stageIdx)
    }
  })
  for (const tag of claimedStage.keys()) {
    if (!model.patterns.has(tag)) diagnostics.push({ severity: 'warning', message: `Analysis stage references load pattern ${tag}, which does not exist in the model`, commandIndex: -1 })
  }

  const nodalLoads: W.NodalLoadTable = { pattern: [], node: [], dof: [], value: [], stage: [] }
  for (const id of patternIds) {
    const pattern = model.patterns.get(id)!
    const pIdx = patternIndex.get(id)!
    for (const child of pattern.children) {
      if (child.kind !== 'load') continue
      const a = child.args as { nodeTag: number; values: number[] }
      const nIdx = resolveNode(a.nodeTag, `Load in pattern ${id}`)
      a.values.forEach((v, dof) => {
        if (!v || dof > 2) return
        const stage = claimedStage.get(id) ?? dcStageByNodeDof.get(`${a.nodeTag}:${dof}`) ?? 0
        nodalLoads.pattern.push(pIdx)
        nodalLoads.node.push(nIdx)
        nodalLoads.dof.push(dof)
        nodalLoads.value.push(v)
        nodalLoads.stage.push(stage)
      })
    }
  }

  // Element loads (`eleLoad`): uniform, local-axis (wx axial, wy/wz transverse) — matches the wire spec. Only
  // the beam-column kinds take them in Carapace today, so other element kinds are skipped with a warning. An element
  // load has no node/DOF to infer a stage from, so it registers with its pattern's claiming stage, else the stage its
  // pattern's nodal loads resolve to, else 0 (everything in one pattern ramps together).
  const elementLoads: W.ElementLoadTable = { pattern: [], elementKind: [], elementIndex: [], load: [], stage: [] }
  const loadedElementTags = new Set<number>()
  for (const id of patternIds) {
    const pattern = model.patterns.get(id)!
    const pIdx = patternIndex.get(id)!
    const nodalStage = pattern.children.flatMap((child) => {
      if (child.kind !== 'load') return []
      const a = child.args as { nodeTag: number; values: number[] }
      return a.values.flatMap((v, dof) => (v && dof <= 2 && dcStageByNodeDof.has(`${a.nodeTag}:${dof}`) ? [dcStageByNodeDof.get(`${a.nodeTag}:${dof}`)!] : []))
    })[0]
    const stage = claimedStage.get(id) ?? nodalStage ?? 0
    for (const child of pattern.children) {
      if (child.kind !== 'eleLoad') continue
      const a = child.args as { eleTags?: number[]; wx?: number; wy?: number; wz?: number }
      const [wx, wy, wz] = [Number(a.wx) || 0, Number(a.wy) || 0, Number(a.wz) || 0]
      if (wz) diagnostics.push({ severity: 'warning', message: `Element load in pattern ${id} sets wz, which has no meaning in a planar model and was ignored`, commandIndex: -1 })
      if (!wx && !wy) continue
      for (const tag of a.eleTags ?? []) {
        const ref = elementRefs.get(tag)
        if (!ref) {
          const ele = model.elements.get(tag)
          diagnostics.push(ele
            ? { severity: 'warning', message: `Element loads on ${ele.eleType} ${tag} (pattern ${id}) are not yet supported by the Carapace compiler and were skipped`, commandIndex: -1 }
            : { severity: 'error', message: `Element load in pattern ${id} references unknown element ${tag}`, commandIndex: -1 })
          continue
        }
        if (ref.kind !== 'elasticBeamColumn' && ref.kind !== 'dispBeamColumn' && ref.kind !== 'forceBeamColumn') {
          diagnostics.push({ severity: 'warning', message: `Element loads on ${model.elements.get(tag)?.eleType ?? ref.kind} ${tag} (pattern ${id}) are not yet supported by the Carapace compiler and were skipped`, commandIndex: -1 })
          continue
        }
        elementLoads.pattern.push(pIdx)
        elementLoads.elementKind.push(ref.kind)
        elementLoads.elementIndex.push(ref.index)
        elementLoads.load.push({ kind: 'uniform', wx, wy })
        elementLoads.stage.push(stage)
        loadedElementTags.add(tag)
      }
    }
  }
  if ((nodalLoads.node.length || elementLoads.pattern.length) && sequence.stages.length === 0) {
    diagnostics.push({ severity: 'error', message: 'Model has loads but the analysis sequence has no stages', commandIndex: -1 })
  }

  // --- sequence ---
  const stages: W.StageSpec[] = []
  sequence.stages.forEach((stage) => {
    const wireStage = compileStage(stage, stages.length, patternIndex, claimedStage, resolveNode, diagnostics)
    if (wireStage) stages.push(wireStage)
  })
  // Every recorded node always captures its full displacement vector — no per-recorder DOF
  // selection. This keeps the dense [step][node][dof] results-storage layout addressable by pure
  // arithmetic (carapace/docs/results-storage-indexeddb.md): a node's columns are always exactly
  // `dofsPerNode` wide. A RecorderSpec's own `dofs` (a subset) is intentionally ignored here — it
  // still governs what the exported openseespy script's recorder command actually asks for; this
  // only shapes Carapace's preview. Reactions get the same full-width treatment; element forces
  // record all six planar local components. Every recorder is one wire scalar per column, so the
  // plan's `columnOffset`s are just running wire-recorder indices.
  const dofsPerNode = model.config.ndf
  const dispLabels = dofLabels(model.config.ndm, dofsPerNode, ['dx', 'dy', 'dz', 'rx', 'ry', 'rz'])
  const reactionLabels = dofLabels(model.config.ndm, dofsPerNode, ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'])
  const recordedNodeTags: number[] = []
  const recordedReactionTags: number[] = []
  const recordedElementTags: number[] = []
  const seen = { disp: new Set<number>(), reaction: new Set<number>(), force: new Set<number>() }
  for (const rec of sequence.recorders) {
    if (rec.targetKind === 'node' && rec.responseKind === 'disp') {
      for (const tag of rec.targetTags) if (!seen.disp.has(tag)) { seen.disp.add(tag); recordedNodeTags.push(tag) }
    } else if (rec.targetKind === 'node' && rec.responseKind === 'reaction') {
      for (const tag of rec.targetTags) if (!seen.reaction.has(tag)) { seen.reaction.add(tag); recordedReactionTags.push(tag) }
    } else if (rec.targetKind === 'element' && rec.responseKind === 'force') {
      for (const tag of rec.targetTags) if (!seen.force.has(tag)) { seen.force.add(tag); recordedElementTags.push(tag) }
    } else {
      diagnostics.push({ severity: 'warning', message: `Recorder "${rec.id}" (${rec.targetKind}/${rec.responseKind}) is not yet supported by Carapace — only node displacement/reaction and element force recorders are — and was skipped`, commandIndex: -1 })
    }
  }
  const recorders: W.RecorderSpecWire[] = []
  const recorderPlans: RecorderPlan[] = []
  const plan = (kind: RecorderPlanKind, targetTag: number, componentLayout: string[]) => {
    recorderPlans.push({ recorderId: recorderIdFor(kind, targetTag), kind, targetTag, columnOffset: recorders.length, componentLayout })
  }
  for (const tag of recordedNodeTags) {
    plan('disp', tag, dispLabels)
    const node = resolveNode(tag, `Recorder for node ${tag}`)
    for (let dof = 0; dof < dofsPerNode; dof++) recorders.push({ response: 'nodeDisp', node, dof })
  }
  for (const tag of recordedReactionTags) {
    // Only supported nodes (an sp/fix constraint) carry a reaction; elsewhere it is just a free DOF's residual.
    if (!model.fixes.get(tag)?.dofs.length) continue
    plan('reaction', tag, reactionLabels)
    const node = resolveNode(tag, `Reaction recorder for node ${tag}`)
    for (let dof = 0; dof < dofsPerNode; dof++) recorders.push({ response: 'reaction', node, dof })
  }
  for (const tag of recordedElementTags) {
    const ref = elementRefs.get(tag)
    // An element the compiler skipped already produced its own "not yet supported" warning.
    if (!ref) continue
    // A loaded element also records the load it carries, in the same column group, right after its end forces.
    const loaded = loadedElementTags.has(tag)
    plan('force', tag, loaded ? [...ELEMENT_FORCE_LABELS, ...ELEMENT_LOAD_LABELS] : ELEMENT_FORCE_LABELS)
    for (let component = 0; component < ELEMENT_FORCE_LABELS.length; component++) {
      recorders.push({ response: 'elementForce', elementKind: ref.kind, elementIndex: ref.index, component })
    }
    if (loaded) {
      for (let component = 0; component < ELEMENT_LOAD_LABELS.length; component++) {
        recorders.push({ response: 'elementLoad', elementKind: ref.kind, elementIndex: ref.index, component })
      }
    }
  }

  if (diagnostics.some((d) => d.severity === 'error')) return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans: [] }

  const input: W.CarapaceInputV1 = {
    header: { schemaVersion: 1, space: 2, engineVersion: 'pysees-dev' },
    nodes,
    materials,
    fibers,
    trusses,
    elasticBeamColumns,
    dispBeamColumns,
    forceBeamColumns: { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] },
    zeroLengths: { nodeI: [], nodeJ: [], materials: [], friction: [] },
    zeroLengthSections,
    equalDofs: { retained: [], constrained: [], dofs: [] },
    rigidDiaphragms: { retained: [], constrained: [] },
    loadPatterns,
    nodalLoads,
    elementLoads,
    sequence: { stages, recorders },

    // Planar-only compiler — every spatial (`*3`) table is required by `CarapaceInputV1` but
    // always empty (see carapaceInputV1.ts's own module doc comment).
    nodes3: { coords: [], fixed: [], massNodeIndex: [], mass: [] },
    fibers3: { sectionOffsets: [], y: [], z: [], area: [], material: [] },
    trusses3: { nodeI: [], nodeJ: [], area: [], material: [], density: [] },
    elasticBeamColumns3: { nodeI: [], nodeJ: [], e: [], g: [], a: [], j: [], iy: [], iz: [], transform: [], density: [] },
    dispBeamColumns3: { nodeI: [], nodeJ: [], g: [], j: [], vecXz: [], fiberSection: [], integration: [], density: [] },
    forceBeamColumns3: { nodeI: [], nodeJ: [], g: [], j: [], vecXz: [], fiberSection: [], integration: [], density: [] },
    zeroLengths3: { nodeI: [], nodeJ: [], materials: [], friction: [] },
    zeroLengthSections3: { nodeI: [], nodeJ: [], fiberSection: [], materials: [] },
    equalDofs3: { retained: [], constrained: [], dofs: [] },
    rigidDiaphragms3: { retained: [], normal: [], constrained: [] },
    nodalLoads3: { pattern: [], node: [], dof: [], value: [], stage: [] },
    elementLoads3: { pattern: [], elementKind: [], elementIndex: [], load: [], stage: [] },
    sequence3: { stages: [], recorders: [] },
  }
  return { input, diagnostics, recordedNodeTags, dofsPerNode, recorderPlans }
}

/** Compiles every `model.sections` entry with `secType === 'Fiber'` into one flat, offset-indexed
 * `W.FiberTable` (see its own doc comment) — shared by `zeroLengthSection` elements (whose section
 * carries the element's whole axial/moment response) and `DispBeamColumn`/`ForceBeamColumn`
 * elements (via their `beamIntegration`'s own `secTag`). Compiles every Fiber section in the
 * model up front, indexed by its own tag, rather than lazily per referencing element — simpler,
 * and cheap at template scale. Only `fiber` items and rectangular `patch` items are understood
 * today (exactly what `templates.ts` produces); anything else is a warning, not silently ignored
 * geometry. A rectangular patch is reduced to one fiber per `y`-subdivision (lumping every
 * `z`-subdivision at that `y`-level into one fiber of the full cross-section width) — correct for
 * a planar (`ndm=2`) model, where only each fiber's `y` and area (not its `z` position) affect the
 * section's axial/bending response. */
function compileFiberSections(
  model: Model,
  resolveMaterial: (matTag: number | undefined, context: string) => number,
  diagnostics: CompileDiagnostic[],
): { fibers: W.FiberTable; sectionIndex: Map<number, number> } {
  const sectionIndex = new Map<number, number>()
  const sectionOffsets: number[] = [0]
  const y: number[] = []
  const area: number[] = []
  const material: number[] = []
  const secTags = [...model.sections.keys()].sort((a, b) => a - b)
  for (const secTag of secTags) {
    const section = model.sections.get(secTag)!
    if (section.secType !== 'Fiber') {
      diagnostics.push({ severity: 'warning', message: `Section ${secTag} (${section.secType}) is not yet supported by the Carapace compiler and was skipped`, commandIndex: -1 })
      continue
    }
    sectionIndex.set(secTag, sectionIndex.size)
    for (const child of section.children) {
      if (child.kind === 'fiber') {
        const a = child.args as { yloc?: number; A?: number; matTag?: number }
        y.push(Number(a.yloc) || 0)
        area.push(Number(a.A) || 0)
        material.push(resolveMaterial(Number(a.matTag), `Fiber in section ${secTag}`))
      } else if (child.kind === 'patch' && child.subType === 'rect') {
        compileRectPatch(child.args, secTag, resolveMaterial, y, area, material)
      } else {
        diagnostics.push({ severity: 'warning', message: `Section ${secTag}: fiber item "${child.kind}/${child.subType}" is not yet supported by the Carapace compiler and was skipped`, commandIndex: -1 })
      }
    }
    sectionOffsets.push(y.length)
  }
  return { fibers: { sectionOffsets, y, area, material }, sectionIndex }
}

function compileRectPatch(
  args: Record<string, unknown>,
  secTag: number,
  resolveMaterial: (matTag: number | undefined, context: string) => number,
  y: number[],
  area: number[],
  material: number[],
): void {
  const a = args as { matTag?: number; numSubdivY?: number; numSubdivZ?: number; y1?: number; z1?: number; y2?: number; z2?: number }
  const numSubdivY = Math.max(1, Math.trunc(Number(a.numSubdivY) || 1))
  const width = Math.abs((Number(a.z2) || 0) - (Number(a.z1) || 0))
  const y1 = Number(a.y1) || 0
  const dy = ((Number(a.y2) || 0) - y1) / numSubdivY
  const matIdx = resolveMaterial(Number(a.matTag), `Patch in section ${secTag}`)
  for (let i = 0; i < numSubdivY; i++) {
    y.push(y1 + dy * (i + 0.5))
    area.push(Math.abs(dy) * width)
    material.push(matIdx)
  }
}

/** Compiles a `beamIntegration` entity into `W.IntegrationSpec` — only `Legendre`/`Lobatto` are
 * meaningful to `core`'s `DispBeamColumn`/`ForceBeamColumn` (their own `BeamIntegration` enum),
 * so anything else (e.g. `'UserDefined'`) defaults to `Legendre` with a diagnostic. */
function compileIntegration(integration: BeamIntegrationEntity, context: string, diagnostics: CompileDiagnostic[]): W.IntegrationSpec {
  const points = Math.max(1, Math.trunc(Number(integration.args.n) || 4))
  if (integration.intType === 'Lobatto') return { kind: 'lobatto', points }
  if (integration.intType !== 'Legendre') {
    diagnostics.push({ severity: 'warning', message: `${context}: beamIntegration "${integration.intType}" not supported, defaulting to Legendre`, commandIndex: -1 })
  }
  return { kind: 'legendre', points }
}

export function compileMaterial(mat: MaterialEntity, diagnostics: CompileDiagnostic[]): W.MaterialSpec {
  const a = mat.args
  switch (mat.matType) {
    case 'Elastic': return { kind: 'elastic', e: Number(a.e) || 0 }
    case 'ElasticPP': return { kind: 'elasticPp', e: Number(a.e) || 0, eyp: Number(a.epsyP) || 0 }
    case 'ENT': return { kind: 'ent', e: Number(a.e) || 0 }
    case 'Steel01': return { kind: 'steel01', fy: Number(a.fy) || 0, e0: Number(a.e0) || 0, b: Number(a.b) || 0, a1: Number(a.a1) || 0, a2: Number(a.a2) || 1, a3: Number(a.a3) || 0, a4: Number(a.a4) || 1 }
    case 'Concrete01': return { kind: 'concrete01', fpc: Number(a.fpc) || 0, epsc0: Number(a.epsc0) || 0, fpcu: Number(a.fpcu) || 0, epscu: Number(a.epsU) || 0 }
    default:
      diagnostics.push({ severity: 'error', message: `Material ${mat.id} (${mat.matType}) is not yet supported by the Carapace compiler`, commandIndex: -1 })
      return { kind: 'elastic', e: 0 }
  }
}

function compileTransform(transfType: string | undefined, context: string, diagnostics: CompileDiagnostic[]): W.TransformSpec {
  switch (transfType) {
    case 'PDelta': return 'pDelta'
    case 'Corotational': return 'corotational'
    case 'Linear': case undefined: return 'linear'
    default:
      diagnostics.push({ severity: 'warning', message: `${context}: geomTransf "${transfType}" not supported, defaulting to Linear`, commandIndex: -1 })
      return 'linear'
  }
}

function compileTimeSeries(ts: { tsType: string; args: Record<string, unknown> } | undefined, diagnostics: CompileDiagnostic[]): W.TimeSeriesSpec {
  if (!ts) return { kind: 'constant' }
  const factor = Number(ts.args.factor) || 1
  if (ts.tsType === 'Constant') return { kind: 'constant' }
  if (ts.tsType === 'Linear') return { kind: 'linear', slope: factor }
  diagnostics.push({ severity: 'warning', message: `Time series type "${ts.tsType}" is not yet supported by the Carapace compiler, treating as Constant`, commandIndex: -1 })
  return { kind: 'constant' }
}

function compileAlgorithm(kind: AlgorithmKind): W.AlgorithmSpec {
  switch (kind) {
    case 'linear': return { kind: 'linear' }
    case 'modified-newton': return { kind: 'newton', tangent: 'initial' }
    case 'krylov-newton': return { kind: 'krylovNewton', tangent: 'current', maxDimension: 3 }
    case 'newton-line-search': return { kind: 'newton', lineSearch: { kind: 'regulaFalsi', tol: 0.8, maxIter: 10, maxEta: 10 } }
    default: return { kind: 'newton' }
  }
}

function compileStage(
  stage: AnalysisStage,
  stageIdx: number,
  patternIndex: Map<number, number>,
  claimedStage: Map<number, number>,
  resolveNode: (id: number, context: string) => number,
  diagnostics: CompileDiagnostic[],
): W.StageSpec | null {
  if (stage.kind !== 'static') {
    diagnostics.push({ severity: 'warning', message: `Stage "${stage.id}" (${stage.kind}) is not yet supported by the Carapace decoder and was skipped`, commandIndex: -1 })
    return null
  }
  const integrator: W.IntegratorSpec = stage.integrator.kind === 'load-control'
    ? { kind: 'loadControl', increment: stage.integrator.increment }
    : { kind: 'displacementControl', node: resolveNode(stage.integrator.nodeTag, `Stage "${stage.id}" displacement control`), dof: stage.integrator.dof, increment: stage.integrator.increment }
  const algorithm: W.AlgorithmSpec = compileAlgorithm(stage.algorithm)
  const convergence: W.ConvergenceSpec | undefined = stage.convergence
    ? { kind: stage.convergence.testType === 'NormDispIncr' ? 'normDispIncr' : stage.convergence.testType === 'EnergyIncr' ? 'energyIncr' : 'normUnbalance', tol: stage.convergence.tol, maxIter: stage.convergence.maxIter }
    : undefined
  // Hold what this stage ramped: its claimed patterns, plus (for the first stage, when it is load-controlled)
  // any pattern nothing claims, since those ramp there. A displacement-control stage's reference load is
  // never frozen unless asked, as freezing it would zero the sensitivity the integrator drives against.
  const unclaimed = stageIdx === 0 && stage.integrator.kind === 'load-control'
    ? [...patternIndex.keys()].filter((tag) => !claimedStage.has(tag))
    : []
  const heldTags = stage.holdLoads === false ? [] : (stage.holdPatternsAfter ?? [...(stage.patterns ?? []), ...unclaimed])
  const holdPatternsAfter = heldTags
    .map((id) => patternIndex.get(id))
    .filter((idx): idx is number => idx !== undefined)
  return { kind: 'static', id: stage.id, steps: stage.steps, integrator, algorithm, convergence, holdPatternsAfter }
}
