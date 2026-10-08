import type { Model, MaterialEntity, BeamIntegrationEntity } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { AlgorithmKind, AnalysisStage } from '@/app/types/analysisSequence'
import type * as W from '@/app/types/carapaceInputV1'
import { compileAnalysisSequence, type CompileDiagnostic } from '@/app/lib/compileAnalysisSequence'
import { orientProblem, readOrient } from '@/app/lib/orient'

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
  /** Every model node tag in node-table order (ascending) — the node order of a modal stage's mode shapes. */
  nodeTags: number[]
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
/** 3D beam-columns: per end `[N, Vy, Vz, T, My, Mz]` (local DOF order), i then j. */
const ELEMENT_FORCE_LABELS_3D = ['Ni', 'Vyi', 'Vzi', 'Ti', 'Myi', 'Mzi', 'Nj', 'Vyj', 'Vzj', 'Tj', 'Myj', 'Mzj']
/** 3D trusses report global nodal forces (and moments, always zero) rather than local ones. */
const TRUSS_FORCE_LABELS_3D = ['Fxi', 'Fyi', 'Fzi', 'Mxi', 'Myi', 'Mzi', 'Fxj', 'Fyj', 'Fzj', 'Mxj', 'Myj', 'Mzj']
/** Appended to a loaded element's force columns: the uniform load it carries at each sample (local axes), so a
 * consumer can recover internal forces between the ends. Absent for unloaded elements. */
export const ELEMENT_LOAD_LABELS = ['wx', 'wy']
export const ELEMENT_LOAD_LABELS_3D = ['wx', 'wy', 'wz']
export const elementLoadLabels = (ndm: number): string[] => (ndm === 3 ? ELEMENT_LOAD_LABELS_3D : ELEMENT_LOAD_LABELS)

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
 * Scope (matches carapace-wasm's current decoder): 2D (ndm=2/ndf=3) and 3D (ndm=3/ndf=6), Truss/ElasticBeamColumn/
 * DispBeamColumn elements (and zeroLengthSection in 2D), static and modal stages only, node displacement/reaction and element force recorders. Everything outside that is
 * reported as a diagnostic and dropped, never guessed at — this is the full validation boundary
 * pysees-handoff.md assigns to the compiler. */
export function compileInputV1(model: Model, analysisHistory: AnalysisHistory): CompileInputV1Result {
  const diagnostics: CompileDiagnostic[] = []
  const fail = (message: string): CompileInputV1Result => {
    diagnostics.push({ severity: 'error', message, commandIndex: -1 })
    return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans: [], nodeTags: [] }
  }

  if (!model.config) return fail('Model is not initialized.')
  const { ndm, ndf } = model.config
  if (!((ndm === 2 && ndf === 3) || (ndm === 3 && ndf === 6))) {
    return fail(`Only 2D (ndm=2, ndf=3) and 3D (ndm=3, ndf=6) models are supported by Carapace — this model is ndm=${ndm}, ndf=${ndf}.`)
  }
  const forceLabels = (kind: W.ElementKind): string[] => (ndm === 2 ? ELEMENT_FORCE_LABELS : kind === 'truss' ? TRUSS_FORCE_LABELS_3D : ELEMENT_FORCE_LABELS_3D)
  const loadLabels = elementLoadLabels(ndm)

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
    for (let k = 0; k < ndm; k++) coords.push(node.coords[k] ?? 0)
    const fix = model.fixes.get(id)
    let bits = 0
    if (fix) for (const dof of fix.dofs) if (dof >= 1 && dof <= ndf) bits |= 1 << (dof - 1)
    fixed.push(bits)
  }
  const massNodeIndex: number[] = []
  const mass: number[] = []
  for (const m of model.masses.values()) {
    const idx = nodeIndex.get(m.nodeId)
    if (idx === undefined) continue
    massNodeIndex.push(idx)
    for (let d = 0; d < ndf; d++) mass.push(m.values[d] ?? 0)
  }
  const nodes: W.NodeTable = { coords, fixed, massNodeIndex, mass }
  // Eigen analysis needs mass on at least as many free DOFs as modes requested (massless DOFs are condensed).
  const massiveDofs = massNodeIndex.reduce((count, idx, k) => count + Array.from({ length: ndf }, (_, d) => d).filter((d) => mass[k * ndf + d] > 0 && !(fixed[idx] & (1 << d))).length, 0)
  for (const stage of sequence.stages) {
    if (stage.kind === 'modal' && stage.modes > massiveDofs) {
      diagnostics.push({ severity: 'error', message: `Eigen analysis "${stage.id}" requests ${stage.modes} mode(s) but the model has mass on only ${massiveDofs} free DOF(s) — assign nodal masses (mass command) first`, commandIndex: -1 })
    }
  }

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
  const { fibers, sectionIndex } = compileFiberSections(model, ndm, resolveMaterial, diagnostics)

  // --- elements ---
  const trusses: W.TrussTable = { nodeI: [], nodeJ: [], area: [], material: [], density: [] }
  const elasticBeamColumns: W.ElasticBeamColumn2dTable = { nodeI: [], nodeJ: [], e: [], a: [], iz: [], transform: [], density: [] }
  const dispBeamColumns: W.FiberBeamColumn2dTable = { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] }
  const elasticBeamColumns3d: W.ElasticBeamColumn3dTable = { nodeI: [], nodeJ: [], e: [], g: [], a: [], j: [], iy: [], iz: [], transform: [], density: [] }
  const dispBeamColumns3d: W.FiberBeamColumn3dTable = { nodeI: [], nodeJ: [], g: [], j: [], vecXz: [], fiberSection: [], integration: [], density: [] }
  const zeroLengthSections: W.ZeroLengthSectionTable = { nodeI: [], nodeJ: [], fiberSection: [], materials: [], orient: [] }
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
    } else if (ndm === 3 && ele.eleType === 'ElasticBeamColumn') {
      const ctx = `ElasticBeamColumn ${ele.id}`
      const transform = compileTransform3(model, Number(ele.args.transfTag), ctx, diagnostics)
      elasticBeamColumns3d.nodeI.push(resolveNode(ele.nodes[0], ctx))
      elasticBeamColumns3d.nodeJ.push(resolveNode(ele.nodes[1], ctx))
      elasticBeamColumns3d.e.push(Number(ele.args.E) || 0)
      elasticBeamColumns3d.g.push(Number(ele.args.G) || 0)
      elasticBeamColumns3d.a.push(Number(ele.args.A) || 0)
      elasticBeamColumns3d.j.push(Number(ele.args.J) || 0)
      elasticBeamColumns3d.iy.push(Number(ele.args.Iy) || 0)
      elasticBeamColumns3d.iz.push(Number(ele.args.Iz) || 0)
      elasticBeamColumns3d.transform.push(transform)
      elasticBeamColumns3d.density.push(0)
      elementRefs.set(ele.id, { kind: 'elasticBeamColumn3d', index: elasticBeamColumns3d.nodeI.length - 1 })
    } else if (ndm === 3 && ele.eleType === 'DispBeamColumn') {
      const ctx = `DispBeamColumn ${ele.id}`
      const integrationTag = Number(ele.args.integrationTag)
      const integration = model.beamIntegrations.get(integrationTag)
      if (!integration) {
        diagnostics.push({ severity: 'error', message: `${ctx} references unknown beamIntegration ${integrationTag}`, commandIndex: -1 })
        continue
      }
      const secTag = Number(integration.args.secTag)
      const secIdx = resolveSection(secTag, ctx)
      const transform = compileTransform3(model, Number(ele.args.transfTag), ctx, diagnostics)
      if (transform.kind !== 'linear3') diagnostics.push({ severity: 'warning', message: `${ctx}: 3D fiber beam-columns only support Linear geometry; ${model.geomTransfs.get(Number(ele.args.transfTag))?.transfType} was treated as Linear`, commandIndex: -1 })
      // A fiber section carries no torsion: its `-GJ` becomes the element's decoupled elastic torsion (g = 1, j = GJ).
      const gj = Number(model.sections.get(secTag)?.args.gJ)
      if (!(gj > 0)) diagnostics.push({ severity: 'error', message: `${ctx}: 3D fiber section ${secTag} needs a torsional stiffness (section Fiber ... -GJ)`, commandIndex: -1 })
      dispBeamColumns3d.nodeI.push(resolveNode(ele.nodes[0], ctx))
      dispBeamColumns3d.nodeJ.push(resolveNode(ele.nodes[1], ctx))
      dispBeamColumns3d.g.push(1)
      dispBeamColumns3d.j.push(gj > 0 ? gj : 0)
      dispBeamColumns3d.vecXz.push(transform.vecXz)
      dispBeamColumns3d.fiberSection.push(secIdx)
      dispBeamColumns3d.integration.push(compileIntegration(integration, ctx, diagnostics))
      dispBeamColumns3d.density.push(0)
      elementRefs.set(ele.id, { kind: 'dispBeamColumn3d', index: dispBeamColumns3d.nodeI.length - 1 })
    } else if (ndm === 3 && ele.eleType === 'zeroLengthSection') {
      diagnostics.push({ severity: 'warning', message: `Element ${ele.id} (zeroLengthSection) is not yet supported in 3D models by the Carapace compiler and was skipped`, commandIndex: -1 })
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
      elementRefs.set(ele.id, { kind: 'elasticBeamColumn2d', index: elasticBeamColumns.nodeI.length - 1 })
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
      elementRefs.set(ele.id, { kind: 'dispBeamColumn2d', index: dispBeamColumns.nodeI.length - 1 })
    } else if (ele.eleType === 'zeroLengthSection') {
      const secIdx = resolveSection(Number(ele.args.secTag), `ZeroLengthSection ${ele.id}`)
      zeroLengthSections.nodeI.push(resolveNode(ele.nodes[0], `ZeroLengthSection ${ele.id}`))
      zeroLengthSections.nodeJ.push(resolveNode(ele.nodes[1], `ZeroLengthSection ${ele.id}`))
      zeroLengthSections.fiberSection.push(secIdx)
      const orient = readOrient(ele.args.orient)
      const problem = ele.args.orient === undefined ? null : orientProblem(ele.args.orient, 2)
      if (problem) diagnostics.push({ severity: 'error', message: `ZeroLengthSection ${ele.id}: ${problem}`, commandIndex: -1 })
      else if (orient) zeroLengthSections.orient!.push({ row: zeroLengthSections.nodeI.length - 1, x: [orient[0], orient[1], orient[2]] })
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

  // Which wire stage ramps each pattern. `wireOfStatic[k]` is the wire stage index of the k-th static stage
  // (wire stages are the static, modal and reset ones compileStage emits, in order). A stage's explicit `patterns` claim wins; a pattern no stage claims falls back
  // to the stage whose displacement-control node/DOF it loads (its reference-load role), else stage 0.
  const staticStages = sequence.stages.filter((st): st is Extract<AnalysisStage, { kind: 'static' }> => st.kind === 'static')
  const wireOfStatic: number[] = []
  let wireCount = 0
  for (const st of sequence.stages) {
    if (st.kind === 'static') wireOfStatic.push(wireCount)
    if (st.kind === 'static' || st.kind === 'modal' || st.kind === 'reset') wireCount++
  }
  const firstStaticWire = wireOfStatic[0] ?? 0
  const claimedStage = new Map<number, number>()
  staticStages.forEach((stage, stageIdx) => {
    for (const tag of stage.patterns ?? []) if (!claimedStage.has(tag)) claimedStage.set(tag, wireOfStatic[stageIdx])
  })
  const dcStageByNodeDof = new Map<string, number>()
  staticStages.forEach((stage, stageIdx) => {
    if (stage.integrator.kind === 'displacement-control') {
      dcStageByNodeDof.set(`${stage.integrator.nodeTag}:${stage.integrator.dof}`, wireOfStatic[stageIdx])
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
        if (!v || dof >= ndf) return
        const stage = claimedStage.get(id) ?? dcStageByNodeDof.get(`${a.nodeTag}:${dof}`) ?? firstStaticWire
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
      return a.values.flatMap((v, dof) => (v && dof < ndf && dcStageByNodeDof.has(`${a.nodeTag}:${dof}`) ? [dcStageByNodeDof.get(`${a.nodeTag}:${dof}`)!] : []))
    })[0]
    const stage = claimedStage.get(id) ?? nodalStage ?? firstStaticWire
    for (const child of pattern.children) {
      if (child.kind !== 'eleLoad') continue
      const a = child.args as { eleTags?: number[]; wx?: number; wy?: number; wz?: number }
      const [wx, wy, wz] = [Number(a.wx) || 0, Number(a.wy) || 0, Number(a.wz) || 0]
      if (wz && ndm === 2) diagnostics.push({ severity: 'warning', message: `Element load in pattern ${id} sets wz, which has no meaning in a 2D model and was ignored`, commandIndex: -1 })
      if (!wx && !wy && !(wz && ndm === 3)) continue
      for (const tag of a.eleTags ?? []) {
        const ref = elementRefs.get(tag)
        if (!ref) {
          const ele = model.elements.get(tag)
          diagnostics.push(ele
            ? { severity: 'warning', message: `Element loads on ${ele.eleType} ${tag} (pattern ${id}) are not yet supported by the Carapace compiler and were skipped`, commandIndex: -1 }
            : { severity: 'error', message: `Element load in pattern ${id} references unknown element ${tag}`, commandIndex: -1 })
          continue
        }
        if (!['elasticBeamColumn2d', 'dispBeamColumn2d', 'forceBeamColumn2d', 'elasticBeamColumn3d', 'dispBeamColumn3d'].includes(ref.kind)) {
          diagnostics.push({ severity: 'warning', message: `Element loads on ${model.elements.get(tag)?.eleType ?? ref.kind} ${tag} (pattern ${id}) are not yet supported by the Carapace compiler and were skipped`, commandIndex: -1 })
          continue
        }
        elementLoads.pattern.push(pIdx)
        elementLoads.elementKind.push(ref.kind)
        elementLoads.elementIndex.push(ref.index)
        elementLoads.load.push(ndm === 3 ? { kind: 'uniform', wx, wy, wz } : { kind: 'uniform', wx, wy })
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
    const wireStage = compileStage(stage, stages.filter((st) => st.kind === 'static').length, patternIndex, claimedStage, resolveNode, diagnostics)
    if (wireStage) stages.push(wireStage)
  })
  // Every recorded node always captures its full displacement vector — no per-recorder DOF
  // selection. This keeps the dense [step][node][dof] results-storage layout addressable by pure
  // arithmetic (carapace/docs/results-storage-indexeddb.md): a node's columns are always exactly
  // `dofsPerNode` wide. A RecorderSpec's own `dofs` (a subset) is intentionally ignored here — it
  // still governs what the exported openseespy script's recorder command actually asks for; this
  // only shapes Carapace's preview. Reactions get the same full-width treatment; element forces
  // record every local component (6 in 2D, 12 in 3D). Every recorder is one wire scalar per column, so the
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
    const labels = forceLabels(ref.kind)
    plan('force', tag, loaded ? [...labels, ...loadLabels] : labels)
    for (let component = 0; component < labels.length; component++) {
      recorders.push({ response: 'elementForce', elementKind: ref.kind, elementIndex: ref.index, component })
    }
    if (loaded) {
      for (let component = 0; component < loadLabels.length; component++) {
        recorders.push({ response: 'elementLoad', elementKind: ref.kind, elementIndex: ref.index, component })
      }
    }
  }

  if (diagnostics.some((d) => d.severity === 'error')) return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans: [], nodeTags: [] }

  const input: W.CarapaceInputV1 = {
    header: { schemaVersion: 1, ndm, engineVersion: 'pysees-dev', recordInitial: true },
    nodes,
    materials,
    fibers,
    trusses,
    elasticBeamColumns2d: elasticBeamColumns,
    dispBeamColumns2d: dispBeamColumns,
    ...(ndm === 3 ? { elasticBeamColumns3d, dispBeamColumns3d } : {}),
    zeroLengthSections,
    loadPatterns,
    nodalLoads,
    elementLoads,
    sequence: { stages, recorders },
  }
  return { input, diagnostics, recordedNodeTags, dofsPerNode, recorderPlans, nodeTags: nodeIds }
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
 * section's axial/bending response; in a 3D model every (y, z) cell is kept, with its `z`. */
function compileFiberSections(
  model: Model,
  ndm: 2 | 3,
  resolveMaterial: (matTag: number | undefined, context: string) => number,
  diagnostics: CompileDiagnostic[],
): { fibers: W.FiberTable; sectionIndex: Map<number, number> } {
  const sectionIndex = new Map<number, number>()
  const sectionOffsets: number[] = [0]
  const y: number[] = []
  const z: number[] = []
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
        const a = child.args as { yloc?: number; zloc?: number; A?: number; matTag?: number }
        y.push(Number(a.yloc) || 0)
        if (ndm === 3) z.push(Number(a.zloc) || 0)
        area.push(Number(a.A) || 0)
        material.push(resolveMaterial(Number(a.matTag), `Fiber in section ${secTag}`))
      } else if (child.kind === 'patch' && child.subType === 'rect') {
        compileRectPatch(child.args, secTag, ndm === 3 ? z : null, resolveMaterial, y, area, material)
      } else {
        diagnostics.push({ severity: 'warning', message: `Section ${secTag}: fiber item "${child.kind}/${child.subType}" is not yet supported by the Carapace compiler and was skipped`, commandIndex: -1 })
      }
    }
    sectionOffsets.push(y.length)
  }
  return { fibers: ndm === 3 ? { sectionOffsets, y, z, area, material } : { sectionOffsets, y, area, material }, sectionIndex }
}

function compileRectPatch(
  args: Record<string, unknown>,
  secTag: number,
  z: number[] | null,
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
  if (z) {
    // 3D: biaxial bending, so every (y, z) cell is its own fiber.
    const numSubdivZ = Math.max(1, Math.trunc(Number(a.numSubdivZ) || 1))
    const z1 = Number(a.z1) || 0
    const dz = ((Number(a.z2) || 0) - z1) / numSubdivZ
    for (let i = 0; i < numSubdivY; i++) for (let k = 0; k < numSubdivZ; k++) {
      y.push(y1 + dy * (i + 0.5))
      z.push(z1 + dz * (k + 0.5))
      area.push(Math.abs(dy * dz))
      material.push(matIdx)
    }
    return
  }
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
    case 'Steel02': return { kind: 'steel02', fy: Number(a.fy) || 0, e0: Number(a.e0) || 0, b: Number(a.b) || 0, r0: Number(a.r0) || 15, cr1: Number(a.cr1) || 0.925, cr2: Number(a.cr2) || 0.15, a1: Number(a.a1) || 0, a2: Number(a.a2) || 1, a3: Number(a.a3) || 0, a4: Number(a.a4) || 1 }
    case 'Concrete01': return { kind: 'concrete01', fpc: Number(a.fpc) || 0, epsc0: Number(a.epsc0) || 0, fpcu: Number(a.fpcu) || 0, epscu: Number(a.epsU) || 0 }
    default:
      diagnostics.push({ severity: 'error', message: `Material ${mat.id} (${mat.matType}) is not yet supported by the Carapace compiler`, commandIndex: -1 })
      return { kind: 'elastic', e: 0 }
  }
}

/** The 3D transformation a beam-column references. `vecxz` is required (the model's own validation enforces it); a missing or
 * malformed one falls back to global X with an error so the run never starts on a guessed orientation. */
function compileTransform3(model: Model, transfTag: number, context: string, diagnostics: CompileDiagnostic[]): W.TransformSpec3 {
  const transf = model.geomTransfs.get(transfTag)
  const raw = transf?.args.vecxz
  const valid = Array.isArray(raw) && raw.length === 3 && raw.every((v) => Number.isFinite(Number(v)))
  const vecXz: [number, number, number] = valid ? [Number(raw[0]), Number(raw[1]), Number(raw[2])] : [1, 0, 0]
  if (!transf) diagnostics.push({ severity: 'error', message: `${context} references unknown geomTransf ${transfTag}`, commandIndex: -1 })
  else if (!valid) diagnostics.push({ severity: 'error', message: `${context}: 3D geomTransf ${transfTag} needs a vecxz (3 numbers)`, commandIndex: -1 })
  if (transf && (transf.args.dI || transf.args.dJ)) diagnostics.push({ severity: 'warning', message: `${context}: geomTransf ${transfTag} joint offsets (-jntOffset) are not supported by Carapace and were ignored`, commandIndex: -1 })
  switch (transf?.transfType) {
    case 'PDelta': return { kind: 'pDelta3', vecXz }
    case 'Corotational':
      diagnostics.push({ severity: 'warning', message: `${context}: Corotational geomTransf is not supported in 3D by Carapace, defaulting to Linear`, commandIndex: -1 })
      return { kind: 'linear3', vecXz }
    case 'Linear': case undefined: return { kind: 'linear3', vecXz }
    default:
      diagnostics.push({ severity: 'warning', message: `${context}: geomTransf "${transf?.transfType}" not supported, defaulting to Linear`, commandIndex: -1 })
      return { kind: 'linear3', vecXz }
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
  if (stage.kind === 'modal') return { kind: 'modal', id: stage.id, modes: stage.modes }
  if (stage.kind === 'reset') return { kind: 'reset', id: stage.id }
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
