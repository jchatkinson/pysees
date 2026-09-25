import type { Model, MaterialEntity } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { AnalysisStage } from '@/app/types/analysisSequence'
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
}

const NO_INDEX = -1

/** Compiles a pysees Model + AnalysisHistory into the CarapaceInputV1 shape decodeInput() expects.
 * Scope (matches carapace-wasm's current decoder): planar (ndm=2/ndf=3) only, Truss/ElasticBeamColumn
 * elements, static stages only, single node/dof displacement recorders. Everything outside that is
 * reported as a diagnostic and dropped, never guessed at — this is the full validation boundary
 * pysees-handoff.md assigns to the compiler. */
export function compileInputV1(model: Model, analysisHistory: AnalysisHistory): CompileInputV1Result {
  const diagnostics: CompileDiagnostic[] = []
  const fail = (message: string): CompileInputV1Result => {
    diagnostics.push({ severity: 'error', message, commandIndex: -1 })
    return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0 }
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

  // --- elements ---
  const trusses: W.TrussTable = { nodeI: [], nodeJ: [], area: [], material: [], density: [] }
  const elasticBeamColumns: W.ElasticBeamColumnTable = { nodeI: [], nodeJ: [], e: [], a: [], iz: [], transform: [], density: [] }
  for (const ele of [...model.elements.values()].sort((a, b) => a.id - b.id)) {
    if (ele.eleType === 'Truss') {
      trusses.nodeI.push(resolveNode(ele.nodes[0], `Truss ${ele.id}`))
      trusses.nodeJ.push(resolveNode(ele.nodes[1], `Truss ${ele.id}`))
      trusses.area.push(Number(ele.args.A) || 0)
      trusses.material.push(resolveMaterial(Number(ele.args.matTag), `Truss ${ele.id}`))
      trusses.density.push(Number(ele.args.rho) || 0)
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

  // Stage a displacement-control integrator targets is that pattern's natural "introduce me here" signal
  // (it's the reference-load pattern for that stage); every other pattern defaults to stage 0. There's no
  // dedicated pattern->stage UI yet, so multi-stage sequences beyond one gravity + one pushover pattern
  // aren't disambiguated further.
  const dcStageByNodeDof = new Map<string, number>()
  sequence.stages.forEach((stage, stageIdx) => {
    if (stage.kind === 'static' && stage.integrator.kind === 'displacement-control') {
      dcStageByNodeDof.set(`${stage.integrator.nodeTag}:${stage.integrator.dof}`, stageIdx)
    }
  })

  const nodalLoads: W.NodalLoadTable = { pattern: [], node: [], dof: [], value: [], stage: [] }
  for (const id of patternIds) {
    const pattern = model.patterns.get(id)!
    const pIdx = patternIndex.get(id)!
    for (const child of pattern.children) {
      if (child.kind !== 'load') {
        if (child.kind === 'eleLoad') diagnostics.push({ severity: 'warning', message: `Element loads (pattern ${id}) are not yet supported by the Carapace compiler and were skipped`, commandIndex: -1 })
        continue
      }
      const a = child.args as { nodeTag: number; values: number[] }
      const nIdx = resolveNode(a.nodeTag, `Load in pattern ${id}`)
      a.values.forEach((v, dof) => {
        if (!v || dof > 2) return
        const stage = dcStageByNodeDof.get(`${a.nodeTag}:${dof}`) ?? 0
        nodalLoads.pattern.push(pIdx)
        nodalLoads.node.push(nIdx)
        nodalLoads.dof.push(dof)
        nodalLoads.value.push(v)
        nodalLoads.stage.push(stage)
      })
    }
  }
  if (nodalLoads.node.length && sequence.stages.length === 0) {
    diagnostics.push({ severity: 'error', message: 'Model has nodal loads but the analysis sequence has no stages', commandIndex: -1 })
  }

  // --- sequence ---
  const stages: W.StageSpec[] = []
  sequence.stages.forEach((stage) => {
    const wireStage = compileStage(stage, patternIndex, resolveNode, diagnostics)
    if (wireStage) stages.push(wireStage)
  })
  // Every recorded node always captures its full displacement vector — no per-recorder DOF
  // selection. This keeps the dense [step][node][dof] results-storage layout addressable by pure
  // arithmetic (carapace/docs/results-storage-indexeddb.md): a node's columns are always exactly
  // `dofsPerNode` wide, so there's never a per-recorder offset table to maintain. A RecorderSpec's
  // own `dofs` (a subset) is intentionally ignored here — it still governs what the exported
  // openseespy script's recorder command actually asks for; this only shapes Carapace's preview.
  const dofsPerNode = model.config.ndf
  const recordedNodeTags: number[] = []
  const seenNodeTags = new Set<number>()
  for (const rec of sequence.recorders) {
    if (rec.targetKind !== 'node' || rec.responseKind !== 'disp') {
      diagnostics.push({ severity: 'warning', message: `Recorder "${rec.id}" (${rec.targetKind}/${rec.responseKind}) is not yet supported by Carapace — only node displacement recorders are — and was skipped`, commandIndex: -1 })
      continue
    }
    for (const tag of rec.targetTags) {
      if (!seenNodeTags.has(tag)) { seenNodeTags.add(tag); recordedNodeTags.push(tag) }
    }
  }
  const recorders: W.RecorderSpecWire[] = []
  for (const tag of recordedNodeTags) {
    for (let dof = 0; dof < dofsPerNode; dof++) {
      recorders.push({ node: resolveNode(tag, `Recorder for node ${tag}`), dof })
    }
  }

  if (diagnostics.some((d) => d.severity === 'error')) return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0 }

  const input: W.CarapaceInputV1 = {
    header: { schemaVersion: 1, space: 2, engineVersion: 'pysees-dev' },
    nodes,
    materials,
    fibers: { sectionOffsets: [], y: [], area: [], material: [] },
    trusses,
    elasticBeamColumns,
    dispBeamColumns: { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] },
    forceBeamColumns: { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] },
    zeroLengths: { nodeI: [], nodeJ: [], materials: [] },
    loadPatterns,
    nodalLoads,
    elementLoads: { pattern: [], elementKind: [], elementIndex: [], load: [], stage: [] },
    sequence: { stages, recorders },
  }
  return { input, diagnostics, recordedNodeTags, dofsPerNode }
}

function compileMaterial(mat: MaterialEntity, diagnostics: CompileDiagnostic[]): W.MaterialSpec {
  const a = mat.args
  switch (mat.matType) {
    case 'Elastic': return { kind: 'elastic', e: Number(a.E) || 0 }
    case 'ElasticPP': return { kind: 'elasticPp', e: Number(a.E) || 0, eyp: Number(a.epsyP) || 0 }
    case 'ENT': return { kind: 'ent', e: Number(a.E) || 0 }
    case 'Steel01': return { kind: 'steel01', fy: Number(a.Fy) || 0, e0: Number(a.E0) || 0, b: Number(a.b) || 0, a1: Number(a.a1) || 0, a2: Number(a.a2) || 1, a3: Number(a.a3) || 0, a4: Number(a.a4) || 1 }
    case 'Concrete01': return { kind: 'concrete01', fpc: Number(a.fpc) || 0, epsc0: Number(a.epsc0) || 0, fpcu: Number(a.fpcu) || 0, epscu: Number(a.epscu) || 0 }
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

function compileStage(
  stage: AnalysisStage,
  patternIndex: Map<number, number>,
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
  const algorithm: W.AlgorithmSpec = stage.algorithm === 'linear' ? 'linear' : 'newtonRaphson'
  const convergence: W.ConvergenceSpec | null = stage.convergence
    ? { kind: stage.convergence.testType === 'NormDispIncr' ? 'normDispIncr' : stage.convergence.testType === 'EnergyIncr' ? 'energyIncr' : 'normUnbalance', tol: stage.convergence.tol, maxIter: stage.convergence.maxIter }
    : null
  const holdPatternsAfter = (stage.holdPatternsAfter ?? [])
    .map((id) => patternIndex.get(id))
    .filter((idx): idx is number => idx !== undefined)
  return { kind: 'static', id: stage.id, steps: stage.steps, integrator, algorithm, convergence, holdPatternsAfter }
}
