import type { Model, MaterialEntity, BeamIntegrationEntity } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { AlgorithmKind, AnalysisStage } from '@/app/types/analysisSequence'
import type * as W from '@/app/types/carapaceInputV1'
import { SHELL_MODIFIER_KEYS } from '@/app/lib/shellModifiers'
import { compileAnalysisSequence, type CompileDiagnostic } from '@/app/lib/compileAnalysisSequence'
import { orientProblem, readOrient } from '@/app/lib/orient'
import { withLumpedBeamMass } from '@/app/lib/beamMass'
import { pathSeries } from '@/app/lib/groundMotion'
import { eleLoadKind } from '@/app/lib/shells'
import { isShell } from '@/app/lib/commands/tables'
import { buildingRecorders } from '@/app/lib/studBuilding'
import { rowLayout, type RowLayout } from '@/app/lib/resultsStorage/recorderRows'

export interface CompileInputV1Result {
  input: W.CarapaceInputV1 | null
  diagnostics: CompileDiagnostic[]
  /** Node tags recorded for displacement, in the order they occupy the dense results-storage
   * layout (carapace/docs/results-storage-indexeddb.md) — `recordedNodeTags[i]` is nodeIndex `i`. */
  recordedNodeTags: number[]
  /** The model's ndf — every recorded node's fixed component width in that dense layout. */
  dofsPerNode: number
  /** Every stored target, in column order: node displacements first, then support reactions, element forces, velocities,
   * accelerations and shell resultants. Each one owns `componentLayout.length` consecutive columns starting at `columnOffset`
   * (after the leading pseudo-time column). */
  recorderPlans: RecorderPlan[]
  /** Every model node tag in node-table order (ascending) — the node order of a modal stage's mode shapes. */
  nodeTags: number[]
  /** Where each wire recorder's values land in the stored row (see `RowLayout`). */
  rowLayout: RowLayout
}

export type RecorderPlanKind = 'disp' | 'vel' | 'accel' | 'reaction' | 'force' | 'shell' | 'building'
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
/** Shells report their 24 global nodal forces and moments, node by node. */
const SHELL_FORCE_LABELS = [1, 2, 3, 4].flatMap((n) => ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'].map((l) => `${l}${n}`))
/** A triangle reports its 18. */
const SHELL3_FORCE_LABELS = SHELL_FORCE_LABELS.slice(0, 18)
/** Shell stress resultants at each of a shell's 4 Gauss points, point-major: `Nx#1`..`Qy#1`, `Nx#2`.. (OpenSees' `stresses` order and sign). */
export const SHELL_RESULTANTS = ['Nx', 'Ny', 'Nxy', 'Mx', 'My', 'Mxy', 'Qx', 'Qy'] as const
export const SHELL_GAUSS_POINTS = 4
const SHELL_RESULTANT_LABELS = Array.from({ length: SHELL_GAUSS_POINTS }, (_, g) => SHELL_RESULTANTS.map((r) => `${r}#${g + 1}`)).flat()
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
 * Scope (matches carapace-wasm's current decoder): native 3D stud-wall buildings and 2D/3D (ndm=2/ndf=3, ndm=3/ndf=6), Truss/ElasticBeamColumn/
 * DispBeamColumn elements (and zeroLengthSection in 2D), static, modal and transient stages, node displacement/reaction and element force recorders. Everything outside that is
 * reported as a diagnostic and dropped, never guessed at — this is the full validation boundary
 * pysees-handoff.md assigns to the compiler. */
export function compileInputV1(model: Model, analysisHistory: AnalysisHistory): CompileInputV1Result {
  const diagnostics: CompileDiagnostic[] = []
  const fail = (message: string): CompileInputV1Result => {
    diagnostics.push({ severity: 'error', message, commandIndex: -1 })
    return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans: [], nodeTags: [], rowLayout: rowLayout(0, []) }
  }

  if (!model.config) return fail('Model is not initialized.')
  if (model.building) {
    if (model.config.ndm !== 3 || model.config.ndf !== 6) return fail('Stud-wall buildings require a 3D model (ndm=3, ndf=6).')
    const conflicts = model.nodes.size || model.masses.size || model.materials.size || model.sections.size || model.geomTransfs.size || model.beamIntegrations.size || model.elements.size || model.fixes.size || model.mpConstraints.size || model.regions.size || model.timeSeries.size || model.patterns.size || model.misc.size
    if (conflicts) return fail('A stud-wall building cannot be combined with node, element, load, or other model tables.')
    if (!Number.isInteger(model.building.steps) || model.building.steps < 1) return fail('Stud-wall building load steps must be a positive integer.')
    if (analysisHistory.commands.length) diagnostics.push({ severity: 'info', message: 'Analysis history is ignored for a stud-wall building; the building uses its generated static load protocol.', commandIndex: -1 })
    const recorders: W.RecorderSpecWire[] = [], recorderPlans: RecorderPlan[] = []
    buildingRecorders(model.building.spec).forEach(({ labels, specs }, g) => {
      recorderPlans.push({ recorderId: `building:${g}`, kind: 'building', targetTag: g, columnOffset: recorders.length, componentLayout: labels })
      recorders.push(...specs)
    })
    const input: W.CarapaceInputV1 = {
      header: { schemaVersion: 1, ndm: 3, engineVersion: 'pysees-dev', recordInitial: true },
      building: model.building.spec,
      sequence: { stages: [{ kind: 'static', id: 'building', steps: model.building.steps, integrator: { kind: 'loadControl', increment: 1 / model.building.steps }, algorithm: { kind: 'newton', tangent: 'current' }, convergence: { kind: 'normDispIncr', tol: 1e-7, maxIter: 100 }, holdPatternsAfter: [] }], recorders },
    }
    return { input, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans, nodeTags: [], rowLayout: rowLayout(recorders.length, recorders.map((_, i) => [i])) }
  }
  try { model = withLumpedBeamMass(model) } catch (e) { return fail(e instanceof Error ? e.message : String(e)) }
  const { ndm, ndf } = model.config!
  if (!((ndm === 2 && ndf === 3) || (ndm === 3 && ndf === 6))) {
    return fail(`Only 2D (ndm=2, ndf=3) and 3D (ndm=3, ndf=6) models are supported by Carapace — this model is ndm=${ndm}, ndf=${ndf}.`)
  }
  const forceLabels = (kind: W.ElementKind): string[] => (kind === 'shell4' ? SHELL_FORCE_LABELS : kind === 'shell3' ? SHELL3_FORCE_LABELS : ndm === 2 ? ELEMENT_FORCE_LABELS : kind === 'truss' ? TRUSS_FORCE_LABELS_3D : ELEMENT_FORCE_LABELS_3D)
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
  const hasElementMass = [...model.elements.values()].some((e) => e.eleType === 'Truss' ? Number(e.args.rho) > 0 : isShell(e.eleType) && Number(model.sections.get(Number(e.args.secTag))?.args.rho) > 0)
  if (sequence.stages.some((s) => s.kind === 'transient') && !mass.some((v) => v > 0) && !hasElementMass) return fail('Transient analysis requires positive nodal or element mass. Add mass before running the earthquake.')
  // Eigen analysis needs mass on at least as many free DOFs as modes requested (massless DOFs are condensed).
  const massiveDofs = massNodeIndex.reduce((count, idx, k) => count + Array.from({ length: ndf }, (_, d) => d).filter((d) => mass[k * ndf + d] > 0 && !(fixed[idx] & (1 << d))).length, 0)
  // A shell with density carries lumped translational mass at each of its free nodes.
  const shellMassNodes = new Set<number>()
  for (const ele of model.elements.values()) {
    if (!isShell(ele.eleType) || !(Number(model.sections.get(Number(ele.args.secTag))?.args.rho) > 0)) continue
    for (const n of ele.nodes) shellMassNodes.add(n)
  }
  const shellMassDofs = [...shellMassNodes].reduce((count, n) => count + [0, 1, 2].filter((d) => !(model.fixes.get(n)?.dofs.includes(d + 1))).length, 0)
  for (const stage of sequence.stages) {
    if (stage.kind === 'modal' && stage.modes > massiveDofs + shellMassDofs) {
      diagnostics.push({ severity: 'error', message: `Eigen analysis "${stage.id}" requests ${stage.modes} mode(s) but the model has mass on only ${massiveDofs + shellMassDofs} free DOF(s) — assign nodal masses (mass command) first`, commandIndex: -1 })
    }
  }

  // --- materials arena ---
  const matIds = [...model.materials.keys()].sort((a, b) => a - b)
  const matIndex = new Map(matIds.map((id, i) => [id, i]))
  const materials: W.MaterialSpec[] = matIds.map((id) => compileMaterial(model.materials.get(id)!, diagnostics, (tag, context) => {
    const idx = matIndex.get(tag)
    if (idx !== undefined) return idx
    diagnostics.push({ severity: 'error', message: `${context} references unknown material ${tag}`, commandIndex: -1 })
    return NO_INDEX
  }))
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
  const { shellSections, shellSectionIndex } = compileShellSections(model, diagnostics)

  // --- elements ---
  const trusses: W.TrussTable = { nodeI: [], nodeJ: [], area: [], material: [], density: [] }
  const elasticBeamColumns: W.ElasticBeamColumn2dTable = { nodeI: [], nodeJ: [], e: [], a: [], iz: [], transform: [], density: [] }
  const dispBeamColumns: W.FiberBeamColumn2dTable = { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] }
  const elasticBeamColumns3d: W.ElasticBeamColumn3dTable = { nodeI: [], nodeJ: [], e: [], g: [], a: [], j: [], iy: [], iz: [], transform: [], density: [] }
  const dispBeamColumns3d: W.FiberBeamColumn3dTable = { nodeI: [], nodeJ: [], g: [], j: [], vecXz: [], fiberSection: [], integration: [], density: [] }
  const zeroLengths: W.ZeroLengthTable = { nodeI: [], nodeJ: [], materials: [], friction: [], orient: [] }
  const zeroLengthSections: W.ZeroLengthSectionTable = { nodeI: [], nodeJ: [], fiberSection: [], materials: [], orient: [] }
  const shell3s: W.Shell3Table = { nodeIds: [], section: [] }
  const shell4s: W.Shell4Table = { nodeIds: [], section: [] }
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
    } else if (isShell(ele.eleType)) {
      const ctx = `${ele.eleType} ${ele.id}`
      if (ndm !== 3) diagnostics.push({ severity: 'error', message: `${ctx}: shell elements need a 3D model`, commandIndex: -1 })
      else {
        const secTag = Number(ele.args.secTag)
        const secIdx = shellSectionIndex.get(secTag)
        if (secIdx === undefined) diagnostics.push({ severity: 'error', message: `${ctx} references section ${secTag}, which is not a supported ElasticMembranePlateSection`, commandIndex: -1 })
        const table = ele.eleType === 'ShellDKGT' ? shell3s : shell4s
        for (const node of ele.nodes) table.nodeIds.push(resolveNode(node, ctx))
        table.section.push(secIdx ?? NO_INDEX)
        elementRefs.set(ele.id, { kind: ele.eleType === 'ShellDKGT' ? 'shell3' : 'shell4', index: table.section.length - 1 })
      }
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
    } else if (ele.eleType === 'zeroLength') {
      const ctx = `ZeroLength ${ele.id}`
      if (ndm !== 2) {
        diagnostics.push({ severity: 'warning', message: `Element ${ele.id} (zeroLength) is not yet supported in 3D models by the Carapace compiler and was skipped`, commandIndex: -1 })
        continue
      }
      const row = zeroLengths.nodeI.length
      zeroLengths.nodeI.push(resolveNode(ele.nodes[0], ctx))
      zeroLengths.nodeJ.push(resolveNode(ele.nodes[1], ctx))
      const mats = Array.isArray(ele.args.mat) ? ele.args.mat.map(Number) : []
      const dirs = Array.isArray(ele.args.dir) ? ele.args.dir.map(Number) : []
      if (mats.length !== dirs.length) diagnostics.push({ severity: 'error', message: `${ctx}: ${mats.length} material(s) for ${dirs.length} direction(s); -mat and -dir must pair up`, commandIndex: -1 })
      const seenDirs = new Set<number>()
      mats.forEach((tag, i) => {
        const dir = dirs[i]
        if (!Number.isInteger(dir) || dir < 1 || dir > 3) { diagnostics.push({ severity: 'error', message: `${ctx}: direction ${String(dirs[i])} is not 1, 2 or 3 in a 2D model`, commandIndex: -1 }); return }
        if (seenDirs.has(dir)) diagnostics.push({ severity: 'error', message: `${ctx}: direction ${dir} has more than one material`, commandIndex: -1 })
        seenDirs.add(dir)
        zeroLengths.materials.push([row, dir - 1, resolveMaterial(tag, ctx)])
      })
      const orient = readOrient(ele.args.orient)
      const problem = ele.args.orient === undefined ? null : orientProblem(ele.args.orient, 2)
      if (problem) diagnostics.push({ severity: 'error', message: `${ctx}: ${problem}`, commandIndex: -1 })
      else if (orient) zeroLengths.orient!.push({ row, x: [orient[0], orient[1], orient[2]] })
      const friction = readZeroLengthFriction(ele.args.friction, ctx, diagnostics)
      if (friction) {
        if (!seenDirs.has(friction.normalDir)) diagnostics.push({ severity: 'error', message: `${ctx}: friction needs a material on its normal direction ${friction.normalDir}`, commandIndex: -1 })
        if (seenDirs.has(friction.shearDir)) diagnostics.push({ severity: 'error', message: `${ctx}: friction carries direction ${friction.shearDir}, so it cannot also have a material`, commandIndex: -1 })
        zeroLengths.friction!.push({ row, normalDof: friction.normalDir - 1, shearDofs: [friction.shearDir - 1], mu: friction.mu, k0: friction.k0, b: friction.b })
      }
      elementRefs.set(ele.id, { kind: 'zeroLength', index: row })
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

  const constraintTables = compileConstraints(model, ndm, ndf, resolveNode, diagnostics)

  // --- load patterns + nodal loads ---
  const patternIds = [...model.patterns.keys()].filter((id) => model.patterns.get(id)!.patternType === 'Plain').sort((a, b) => a - b)
  for (const pattern of model.patterns.values()) {
    if (pattern.patternType !== 'Plain' && pattern.patternType !== 'UniformExcitation') diagnostics.push({ severity: 'error', message: `Pattern ${pattern.id}: ${pattern.patternType} is not supported by Carapace`, commandIndex: -1 })
  }
  const patternIndex = new Map(patternIds.map((id, i) => [id, i]))
  const series: W.TimeSeriesSpec[] = []
  const scaleFactor: number[] = []
  for (const id of patternIds) {
    const pattern = model.patterns.get(id)!
    const ts = model.timeSeries.get(Number(pattern.args.tsTag))
    series.push(compileTimeSeries(ts, diagnostics))
    scaleFactor.push(Number(pattern.args.fact ?? 1) * (ts?.tsType === 'Constant' ? Number(ts.args.factor ?? 1) : 1))
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
    wireCount++
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
      const a = child.args as { eleTags?: number[]; wx?: number; wy?: number; wz?: number; pressure?: number; bx?: number; by?: number; bz?: number }
      const loadKind = eleLoadKind(child.args)
      if (loadKind !== 'beam') {
        const spec: W.ElementLoadSpec = loadKind === 'pressure' ? { kind: 'shellPressure', pressure: Number(a.pressure) || 0 } : { kind: 'shellBody', bx: Number(a.bx) || 0, by: Number(a.by) || 0, bz: Number(a.bz) || 0 }
        for (const tag of a.eleTags ?? []) {
          const ref = elementRefs.get(tag)
          if (ref?.kind !== 'shell3' && ref?.kind !== 'shell4') {
            const ele = model.elements.get(tag)
            diagnostics.push(!ele
              ? { severity: 'error', message: `Element load in pattern ${id} references unknown element ${tag}`, commandIndex: -1 }
              : isShell(ele.eleType)
                ? { severity: 'warning', message: `Shell loads on ${ele.eleType} ${tag} (pattern ${id}) are not supported by the Carapace compiler and were skipped`, commandIndex: -1 }
                : { severity: 'error', message: `Shell pressure and self-weight in pattern ${id} cannot load ${ele.eleType} ${tag}, which is not a shell`, commandIndex: -1 })
            continue
          }
          elementLoads.pattern.push(pIdx)
          elementLoads.elementKind.push(ref.kind)
          elementLoads.elementIndex.push(ref.index)
          elementLoads.load.push(spec)
          elementLoads.stage.push(stage)
        }
        continue
      }
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
    const wireStage = compileStage(stage, stages.filter((st) => st.kind === 'static').length, patternIndex, claimedStage, resolveNode, diagnostics, model)
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
  const dofsPerNode = ndf
  const dispLabels = dofLabels(ndm, dofsPerNode, ['dx', 'dy', 'dz', 'rx', 'ry', 'rz'])
  const reactionLabels = dofLabels(ndm, dofsPerNode, ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'])
  const recordedNodeTags: number[] = []
  const recordedReactionTags: number[] = []
  const recordedElementTags: number[] = []
  const dynamicTags = { vel: new Set<number>(), accel: new Set<number>() }
  const seen = { disp: new Set<number>(), reaction: new Set<number>(), force: new Set<number>() }
  for (const rec of sequence.recorders) {
    if (rec.targetKind === 'node' && rec.responseKind === 'disp') {
      for (const tag of rec.targetTags) if (!seen.disp.has(tag)) { seen.disp.add(tag); recordedNodeTags.push(tag) }
    } else if (rec.targetKind === 'node' && (rec.responseKind === 'vel' || rec.responseKind === 'accel')) {
      for (const tag of rec.targetTags) dynamicTags[rec.responseKind].add(tag)
    } else if (rec.targetKind === 'node' && rec.responseKind === 'reaction') {
      for (const tag of rec.targetTags) if (!seen.reaction.has(tag)) { seen.reaction.add(tag); recordedReactionTags.push(tag) }
    } else if (rec.targetKind === 'element' && rec.responseKind === 'force') {
      for (const tag of rec.targetTags) if (!seen.force.has(tag)) { seen.force.add(tag); recordedElementTags.push(tag) }
    } else {
      diagnostics.push({ severity: 'warning', message: `Recorder "${rec.id}" (${rec.targetKind}/${rec.responseKind}) is not yet supported by Carapace — only node displacement/reaction and element force recorders are — and was skipped`, commandIndex: -1 })
    }
  }
  // One bulk recorder per node quantity and per element table (Carapace returns each as a flat Float64Array per step); `columns`
  // scatters its values into the stored row, where every plan's columns stay contiguous. The stored layout is what an OpenSees
  // recorder file holds: one row per step, a column group per node or element.
  const recorders: W.RecorderSpecWire[] = []
  const recorderPlans: RecorderPlan[] = []
  const columns: number[][] = []
  let width = 0
  const plan = (kind: RecorderPlanKind, targetTag: number, componentLayout: string[]) => {
    recorderPlans.push({ recorderId: recorderIdFor(kind, targetTag), kind, targetTag, columnOffset: width, componentLayout })
    width += componentLayout.length
    return width - componentLayout.length
  }
  /** A bulk recorder over `rows` whose row `k` fills `perRow` columns from `at[k]`. */
  const bulk = (spec: Omit<Extract<W.RecorderSpecWire, { response: 'bulk' }>, 'response'>, at: number[], perRow: number) => {
    if (!at.length) return
    recorders.push({ response: 'bulk', ...spec })
    columns.push(at.flatMap((c) => Array.from({ length: perRow }, (_, j) => c + j)))
  }
  const nodeBulk = (quantity: W.BulkQuantity, kind: RecorderPlanKind, tags: number[], labels: string[]) =>
    bulk({ table: 'nodes', quantity, rows: tags.map((tag) => resolveNode(tag, `${kind} recorder for node ${tag}`)) }, tags.map((tag) => plan(kind, tag, labels)), dofsPerNode)
  nodeBulk('displacement', 'disp', recordedNodeTags, dispLabels)
  // Only supported nodes (an sp/fix constraint) carry a reaction; elsewhere it is just a free DOF's residual.
  nodeBulk('reaction', 'reaction', recordedReactionTags.filter((tag) => model.fixes.get(tag)?.dofs.length), reactionLabels)
  // Per element table: rows and first columns of the end forces, of the loads (loaded frame elements, right after their end forces) and of shell resultants.
  const groups = new Map<W.ElementKind, Record<'force' | 'load' | 'shell', { rows: number[]; at: number[] }>>()
  const group = (kind: W.ElementKind) => groups.get(kind) ?? groups.set(kind, { force: { rows: [], at: [] }, load: { rows: [], at: [] }, shell: { rows: [], at: [] } }).get(kind)!
  // An element the compiler skipped already produced its own "not yet supported" warning.
  const recordedRefs = recordedElementTags.flatMap((tag) => { const ref = elementRefs.get(tag); return ref ? [{ tag, ...ref }] : [] })
  for (const { tag, kind, index } of recordedRefs) {
    const loaded = loadedElementTags.has(tag) && kind !== 'shell3' && kind !== 'shell4'
    const labels = forceLabels(kind)
    const at = plan('force', tag, loaded ? [...labels, ...loadLabels] : labels)
    const g = group(kind)
    g.force.rows.push(index); g.force.at.push(at)
    if (loaded) { g.load.rows.push(index); g.load.at.push(at + labels.length) }
  }
  for (const kind of ['vel', 'accel'] as const) {
    const labels = dofLabels(ndm, dofsPerNode, kind === 'vel' ? ['vx', 'vy', 'vz', 'vrx', 'vry', 'vrz'] : ['ax', 'ay', 'az', 'arx', 'ary', 'arz'])
    nodeBulk(kind === 'vel' ? 'velocity' : 'acceleration', kind, [...dynamicTags[kind]], labels)
  }
  // Shells also record their stress resultants at the 4 Gauss points (32 columns each), which the contour view reads.
  for (const { tag, kind, index } of recordedRefs) {
    if (kind !== 'shell3' && kind !== 'shell4') continue
    const g = group(kind)
    g.shell.rows.push(index); g.shell.at.push(plan('shell', tag, SHELL_RESULTANT_LABELS))
  }
  for (const [elementKind, g] of groups) {
    bulk({ table: 'elements', elementKind, quantity: 'endForce', rows: g.force.rows }, g.force.at, forceLabels(elementKind).length)
    bulk({ table: 'elements', elementKind, quantity: 'load', rows: g.load.rows }, g.load.at, loadLabels.length)
    bulk({ table: 'elements', elementKind, quantity: 'stress', rows: g.shell.rows }, g.shell.at, SHELL_RESULTANT_LABELS.length)
  }

  if (diagnostics.some((d) => d.severity === 'error')) return { input: null, diagnostics, recordedNodeTags: [], dofsPerNode: 0, recorderPlans: [], nodeTags: [], rowLayout: rowLayout(0, []) }

  const input: W.CarapaceInputV1 = {
    header: { schemaVersion: 1, ndm, engineVersion: 'pysees-dev', recordInitial: true },
    nodes,
    materials,
    fibers,
    trusses,
    elasticBeamColumns2d: elasticBeamColumns,
    dispBeamColumns2d: dispBeamColumns,
    ...(ndm === 3 ? { elasticBeamColumns3d, dispBeamColumns3d, shellSections, shell3s, shell4s } : {}),
    ...(zeroLengths.nodeI.length ? { zeroLengths } : {}),
    zeroLengthSections,
    ...constraintTables,
    loadPatterns,
    nodalLoads,
    elementLoads,
    sequence: { stages, recorders },
  }
  return { input, diagnostics, recordedNodeTags, dofsPerNode, recorderPlans, nodeTags: nodeIds, rowLayout: rowLayout(width, columns) }
}

/** Positive integers from a scalar or list arg (`dofs`, `cNodeTags`), or `null` when any entry is not one. */
function intList(raw: unknown): number[] | null {
  const list = (Array.isArray(raw) ? raw : raw === undefined || raw === '' ? [] : [raw]).map(Number)
  return list.every((v) => Number.isInteger(v) && v > 0) ? list : null
}

/**
 * Lowers the model's multi-point constraints to Carapace's constraint tables, with OpenSees' meaning (dofs 1-based in the model,
 * 0-based on the wire). `equalDOF` → `equalDofs`; `equalDOF_Mixed` (`rcdofs` = retained/constrained dof pairs) → `linearConstraints`;
 * `rigidLink beam` → `rigidLinks`; `rigidLink bar` (translations only) → `equalDofs`; 3D `rigidDiaphragm perpDirn` → `rigidDiaphragms`
 * with that normal, plus an `equalDofs` row tying each constrained node's rotation about the normal, which OpenSees also ties.
 * OpenSees only has the diaphragm in 3D, so a 2D one is an error rather than Carapace's 2D (`ux`-only) variant.
 */
function compileConstraints(model: Model, ndm: number, ndf: number, resolveNode: (id: number, context: string) => number, diagnostics: CompileDiagnostic[]): Partial<W.CarapaceInputV1> {
  const equalDofs: W.EqualDofTable = { retained: [], constrained: [], dofs: [] }
  const diaphragms: W.RigidDiaphragmTable = { retained: [], normal: [], constrained: [] }
  const links: W.RigidLinkTable = { master: [], slave: [] }
  const linear: W.LinearConstraintTable = { slaveNode: [], slaveDof: [], termOffsets: [0], termNode: [], termDof: [], termCoeff: [] }
  const tie = (r: number, c: number, dofs: number[]) => {
    equalDofs.retained.push(r); equalDofs.constrained.push(c)
    for (const d of dofs) equalDofs.dofs.push([equalDofs.retained.length - 1, d - 1])
  }
  for (const mp of [...model.mpConstraints.values()].sort((a, b) => a.id - b.id)) {
    const ctx = `Constraint ${mp.id} (${mp.kind})`
    const error = (message: string) => diagnostics.push({ severity: 'error', message: `${ctx}: ${message}`, commandIndex: -1 })
    const a = mp.args
    const r = resolveNode(Number(a.rNodeTag), ctx)
    const badDofs = (dofs: number[] | null, max: number): dofs is null => !dofs || !dofs.length || dofs.some((d) => d > max)
    if (mp.kind === 'equalDOF') {
      const dofs = intList(a.dofs)
      if (badDofs(dofs, ndf)) { error(`dofs must list one or more of 1-${ndf}`); continue }
      tie(r, resolveNode(Number(a.cNodeTag), ctx), dofs)
    } else if (mp.kind === 'equalDOF_Mixed') {
      const pairs = intList(a.rcdofs)
      if (badDofs(pairs, ndf) || pairs.length % 2 || (a.numDOF !== undefined && a.numDOF !== '' && Number(a.numDOF) * 2 !== pairs.length)) { error(`rcdofs must be numDOF pairs of retained and constrained dofs (1-${ndf})`); continue }
      const c = resolveNode(Number(a.cNodeTag), ctx)
      for (let i = 0; i < pairs.length; i += 2) {
        linear.slaveNode.push(c); linear.slaveDof.push(pairs[i + 1] - 1)
        linear.termNode.push(r); linear.termDof.push(pairs[i] - 1); linear.termCoeff.push(1)
        linear.termOffsets.push(linear.termNode.length)
      }
    } else if (mp.kind === 'rigidLink') {
      const type = String(a.type ?? '').toLowerCase()
      const c = resolveNode(Number(a.cNodeTag), ctx)
      if (type === 'beam') { links.master.push(r); links.slave.push(c) }
      else if (type === 'bar') tie(r, c, Array.from({ length: ndm }, (_, i) => i + 1))
      else error(`type must be beam or bar, got "${String(a.type ?? '')}"`)
    } else if (mp.kind === 'rigidDiaphragm') {
      const perp = Number(a.perpDirn)
      const nodes = intList(a.cNodeTags)
      if (ndm !== 3) { error('OpenSees rigid diaphragms are 3D only; use equalDOF in a 2D model'); continue }
      if (![1, 2, 3].includes(perp)) { error(`perpDirn must be 1, 2 or 3, got ${String(a.perpDirn)}`); continue }
      if (!nodes?.length) { error('cNodeTags must list one or more nodes'); continue }
      const row = diaphragms.retained.push(r) - 1
      diaphragms.normal!.push((['x', 'y', 'z'] as const)[perp - 1])
      for (const id of nodes) {
        const c = resolveNode(id, ctx)
        diaphragms.constrained.push([row, c])
        tie(r, c, [3 + perp])
      }
    } else error('is not supported by the Carapace compiler')
  }
  return {
    ...(equalDofs.retained.length ? { equalDofs } : {}),
    ...(diaphragms.retained.length ? { rigidDiaphragms: diaphragms } : {}),
    ...(links.master.length ? { rigidLinks: links } : {}),
    ...(linear.slaveNode.length ? { linearConstraints: linear } : {}),
  }
}

/** The PySees-only Coulomb friction of a `zeroLength`: `{ normalDir, shearDir, mu, k0, b }` (1-based directions), or `undefined` when the element has none. */
function readZeroLengthFriction(raw: unknown, ctx: string, diagnostics: CompileDiagnostic[]): { normalDir: number; shearDir: number; mu: number; k0: number; b: number } | undefined {
  if (raw === undefined || raw === null) return undefined
  const f = raw as Record<string, unknown>
  const normalDir = Number(f.normalDir), shearDir = Number(f.shearDir), mu = Number(f.mu), k0 = Number(f.k0), b = f.b === undefined ? 0 : Number(f.b)
  const dirOk = (d: number) => Number.isInteger(d) && d >= 1 && d <= 3
  if (typeof raw !== 'object' || !dirOk(normalDir) || !dirOk(shearDir) || normalDir === shearDir || !(mu >= 0) || !Number.isFinite(mu) || !(k0 > 0) || !Number.isFinite(k0) || !(b >= 0 && b <= 1)) {
    diagnostics.push({ severity: 'error', message: `${ctx}: friction needs distinct normalDir and shearDir (1-3), mu >= 0, k0 > 0 and 0 <= b <= 1`, commandIndex: -1 })
    return undefined
  }
  return { normalDir, shearDir, mu, k0, b }
}

/** Reads the PySees-only `modifiers` object of a shell section: `undefined` when there is none, `null` (after an error diagnostic) when a factor is not a positive finite number. */
function compileShellModifiers(tag: number, raw: unknown, diagnostics: CompileDiagnostic[]): W.ShellModifiersSpec | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'object') {
    diagnostics.push({ severity: 'error', message: `Section ${tag} (ElasticMembranePlateSection) has stiffness modifiers that are not an object`, commandIndex: -1 })
    return null
  }
  const out: W.ShellModifiersSpec = {}
  for (const key of SHELL_MODIFIER_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (value === undefined || value === '') continue
    const factor = Number(value)
    if (!Number.isFinite(factor) || factor <= 0) {
      diagnostics.push({ severity: 'error', message: `Section ${tag} (ElasticMembranePlateSection) stiffness modifier ${key} must be a positive number, got ${String(value)}`, commandIndex: -1 })
      return null
    }
    out[key] = factor
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Compiles the `ElasticMembranePlateSection` sections (the shells' arena); `shellSectionIndex` maps a section tag to its arena row. */
function compileShellSections(model: Model, diagnostics: CompileDiagnostic[]): { shellSections: W.ShellSectionSpec[]; shellSectionIndex: Map<number, number> } {
  const shellSections: W.ShellSectionSpec[] = []
  const shellSectionIndex = new Map<number, number>()
  for (const [tag, section] of [...model.sections].sort((a, b) => a[0] - b[0])) {
    if (section.secType !== 'ElasticMembranePlateSection') continue
    const a = section.args
    const ep = a.epModifier === undefined || a.epModifier === '' ? 1 : Number(a.epModifier)
    if (!Number.isFinite(ep) || ep <= 0) {
      diagnostics.push({ severity: 'error', message: `Section ${tag} (ElasticMembranePlateSection) has a plate modifier of ${String(a.epModifier)}, which must be a positive number`, commandIndex: -1 })
      continue
    }
    let modifiers = compileShellModifiers(tag, a.modifiers, diagnostics)
    if (modifiers === null) continue
    if (ep !== 1) {
      // OpenSees' Ep_modifier scales bending and transverse shear and leaves the membrane alone, which is m11 = m22 = m12 = v13 = v23 = ep.
      // Giving both it and explicit modifiers is ambiguous, so it is an error rather than a guess.
      if (modifiers) {
        diagnostics.push({ severity: 'error', message: `Section ${tag} (ElasticMembranePlateSection) sets both a plate modifier (${ep}) and stiffness modifiers; use one or the other`, commandIndex: -1 })
        continue
      }
      modifiers = { m11: ep, m22: ep, m12: ep, v13: ep, v23: ep }
    }
    shellSectionIndex.set(tag, shellSections.length)
    shellSections.push({ kind: 'elasticMembranePlate', e: Number(a.eMod), nu: Number(a.nu), h: Number(a.h), rho: Number(a.rho) || 0, ...(modifiers ? { modifiers } : {}) })
  }
  return { shellSections, shellSectionIndex }
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
    if (section.secType === 'ElasticMembranePlateSection') continue // compiled by compileShellSections
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
    // OpenSees' FiberSection2d/3d measure fiber coordinates from the area-weighted centroid of all the section's fibers (steel and concrete alike),
    // not from the origin they were written against; Carapace takes y (and z) from the element axis. Moving the origin there keeps the two
    // engines agreeing for sections that are not symmetric about it (a symmetric one has its centroid at the origin already).
    const start = sectionOffsets[sectionOffsets.length - 1]
    const total = area.slice(start).reduce((a, b) => a + b, 0)
    if (total > 0) {
      const yBar = area.slice(start).reduce((q, a, i) => q + a * y[start + i], 0) / total
      for (let i = start; i < y.length; i++) y[i] -= yBar
      if (ndm === 3) {
        const zBar = area.slice(start).reduce((q, a, i) => q + a * z[start + i], 0) / total
        for (let i = start; i < z.length; i++) z[i] -= zBar
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

/** Maps a referenced material tag to its index in the materials arena (composites only); reports its own diagnostic when the tag is unknown. */
export type MaterialRef = (tag: number, context: string) => number

const blank = (v: unknown) => v === undefined || v === null || v === ''
const num = (v: unknown, fallback = 0) => (blank(v) || !Number.isFinite(Number(v)) ? fallback : Number(v))
const list = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x) => !blank(x)).map(Number) : [])
/** A (force, deformation) pair, or `fallback` when the vec is not filled in. */
const pair = (v: unknown, fallback?: [number, number]): [number, number] => (Array.isArray(v) && v.length >= 2 && !blank(v[0]) && !blank(v[1]) ? [Number(v[0]), Number(v[1])] : fallback ?? [0, 0])

export function compileMaterial(mat: MaterialEntity, diagnostics: CompileDiagnostic[], ref?: MaterialRef): W.MaterialSpec {
  const a = mat.args
  const error = (message: string) => diagnostics.push({ severity: 'error', message: `Material ${mat.id} (${mat.matType}): ${message}`, commandIndex: -1 })
  const refTag = (tag: number): number => ref ? ref(tag, `Material ${mat.id} (${mat.matType})`) : (error(`cannot reference material ${tag} here`), NO_INDEX)
  switch (mat.matType) {
    case 'Elastic': return { kind: 'elastic', e: Number(a.e) || 0 }
    case 'ElasticPP':
      // Carapace yields symmetrically from zero plastic strain.
      if (!blank(a.epsyN) && Number(a.epsyN) !== Number(a.epsyP)) error('asymmetric yield (epsyN) is not supported by Carapace')
      if (!blank(a.eps0) && Number(a.eps0) !== 0) error('initial strain (eps0) is not supported by Carapace')
      return { kind: 'elasticPp', e: Number(a.e) || 0, eyp: Number(a.epsyP) || 0 }
    case 'ENT': return { kind: 'ent', e: Number(a.e) || 0 }
    case 'Steel01': return { kind: 'steel01', fy: Number(a.fy) || 0, e0: Number(a.e0) || 0, b: Number(a.b) || 0, a1: Number(a.a1) || 0, a2: Number(a.a2) || 1, a3: Number(a.a3) || 0, a4: Number(a.a4) || 1 }
    case 'Steel02':
      if (!blank(a.sigInit) && Number(a.sigInit) !== 0) error('initial stress (sigInit) is not supported by Carapace')
      return { kind: 'steel02', fy: Number(a.fy) || 0, e0: Number(a.e0) || 0, b: Number(a.b) || 0, r0: Number(a.r0) || 15, cr1: Number(a.cr1) || 0.925, cr2: Number(a.cr2) || 0.15, a1: Number(a.a1) || 0, a2: Number(a.a2) || 1, a3: Number(a.a3) || 0, a4: Number(a.a4) || 1 }
    case 'Concrete01': return { kind: 'concrete01', fpc: Number(a.fpc) || 0, epsc0: Number(a.epsc0) || 0, fpcu: Number(a.fpcu) || 0, epscu: Number(a.epsU) || 0 }
    case 'Concrete02': return { kind: 'concrete02', fc: num(a.fpc), epsc0: num(a.epsc0), fcu: num(a.fpcu), epscu: num(a.epsU), rat: num(a.lambda), ft: num(a.ft), ets: num(a.ets) }
    case 'Hysteretic': {
      const [p1f, p1d] = pair(a.p1), [p2f, p2d] = pair(a.p2), [p3f, p3d] = pair(a.p3, [p2f, p2d])
      const [n1f, n1d] = pair(a.n1), [n2f, n2d] = pair(a.n2), [n3f, n3d] = pair(a.n3, [n2f, n2d])
      return { kind: 'hysteretic', mom1p: p1f, rot1p: p1d, mom2p: p2f, rot2p: p2d, mom3p: p3f, rot3p: p3d, mom1n: n1f, rot1n: n1d, mom2n: n2f, rot2n: n2d, mom3n: n3f, rot3n: n3d, pinchX: num(a.pinchX), pinchY: num(a.pinchY), damfc1: num(a.damage1), damfc2: num(a.damage2), beta: num(a.beta) }
    }
    case 'Pinching4': {
      const g = (p: string): [number, number, number, number] => [num(a[`${p}1`]), num(a[`${p}2`]), num(a[`${p}3`]), num(a[`${p}4`])]
      const dmg = String(a.dmgType ?? '').replace(/['"]/g, '').trim().toLowerCase()
      if (dmg !== 'cycle' && dmg !== 'energy') error(`dmgType must be 'cycle' or 'energy' (got "${String(a.dmgType ?? '')}")`)
      return {
        kind: 'pinching4',
        stress1p: num(a.ePf1), strain1p: num(a.ePd1), stress2p: num(a.ePf2), strain2p: num(a.ePd2), stress3p: num(a.ePf3), strain3p: num(a.ePd3), stress4p: num(a.ePf4), strain4p: num(a.ePd4),
        stress1n: num(a.eNf1), strain1n: num(a.eNd1), stress2n: num(a.eNf2), strain2n: num(a.eNd2), stress3n: num(a.eNf3), strain3n: num(a.eNd3), stress4n: num(a.eNf4), strain4n: num(a.eNd4),
        rDispP: num(a.rDispP), rForceP: num(a.rForceP), uForceP: num(a.uForceP), rDispN: num(a.rDispN), rForceN: num(a.rForceN), uForceN: num(a.uForceN),
        gammaKParams: g('gK'), gammaKLimit: num(a.gKLim), gammaDParams: g('gD'), gammaDLimit: num(a.gDLim), gammaFParams: g('gF'), gammaFLimit: num(a.gFLim), gammaE: num(a.gE),
        dmgCyc: dmg === 'cycle' ? 'cycleBased' : 'energyBased',
      }
    }
    case 'Parallel': {
      const tags = list(a.matTags), factors = list(a.factorArgs)
      if (!tags.length) error('needs at least one material tag')
      if (factors.length && factors.length !== tags.length) error(`-factors lists ${factors.length} value(s) for ${tags.length} material(s)`)
      return { kind: 'parallel', children: tags.map((t, i) => [refTag(t), factors.length === tags.length ? factors[i] : 1]) }
    }
    case 'Series': {
      const tags = list(a.matTags)
      if (!tags.length) error('needs at least one material tag')
      return { kind: 'series', children: tags.map(refTag) }
    }
    case 'MinMax': {
      // OpenSees' defaults are effectively unbounded.
      if (blank(a.otherTag)) error('needs a wrapped material (otherTag)')
      return { kind: 'minMax', inner: refTag(Number(a.otherTag)), minStrain: num(a.minStrain, -1e16), maxStrain: num(a.maxStrain, 1e16) }
    }
    default:
      diagnostics.push({ severity: 'error', message: `Material ${mat.id} (${mat.matType}) is not yet supported by the Carapace compiler`, commandIndex: -1 })
      return { kind: 'elastic', e: 0 }
  }
}

/** Compiles `root` plus every material it references (transitively) into a self-contained arena for the material probe:
 * `arena` holds the dependencies, and `material` (the root) refers to them by arena index. Unknown tags and cycles are diagnostics. */
export function compileMaterialWithDependencies(root: MaterialEntity, lookup: ReadonlyMap<number, MaterialEntity>, diagnostics: CompileDiagnostic[]): { material: W.MaterialSpec; arena: W.MaterialSpec[] } {
  const arena: W.MaterialSpec[] = []
  const index = new Map<number, number>()
  const active = new Set<number>([root.id])
  const ref: MaterialRef = (tag, context) => {
    const done = index.get(tag)
    if (done !== undefined) return done
    const dep = lookup.get(tag)
    if (!dep) { diagnostics.push({ severity: 'error', message: `${context} references unknown material ${tag}`, commandIndex: -1 }); return NO_INDEX }
    if (active.has(tag)) { diagnostics.push({ severity: 'error', message: `${context} refers back to material ${tag} (circular reference)`, commandIndex: -1 }); return NO_INDEX }
    active.add(tag)
    const spec = compileMaterial(dep, diagnostics, ref)
    active.delete(tag)
    index.set(tag, arena.length)
    arena.push(spec)
    return arena.length - 1
  }
  return { material: compileMaterial(root, diagnostics, ref), arena }
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
  const factor = ts.args.factor === undefined || ts.args.factor === '' ? 1 : Number(ts.args.factor)
  if (!Number.isFinite(factor)) diagnostics.push({ severity: 'error', message: 'Time-series factor must be finite.', commandIndex: -1 })
  if (ts.tsType === 'Constant') return { kind: 'constant' }
  if (ts.tsType === 'Linear') return { kind: 'linear', slope: factor }
  if (ts.tsType === 'Path') {
    try { return { kind: 'boundedPath', ...pathSeries(ts.args), useLast: ts.args['-useLast'] === true } }
    catch (e) { diagnostics.push({ severity: 'error', message: `Path time series: ${e instanceof Error ? e.message : String(e)}`, commandIndex: -1 }) }
  } else diagnostics.push({ severity: 'error', message: `Time series type "${ts.tsType}" is not supported by Carapace`, commandIndex: -1 })
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
  model: Model,
): W.StageSpec | null {
  if (stage.kind === 'modal') return { kind: 'modal', id: stage.id, modes: stage.modes }
  if (stage.kind === 'reset') return { kind: 'reset', id: stage.id }
  if (stage.kind === 'transient') {
    const c = stage.config
    const damping = c.damping ?? { alphaM: 0, betaK: 0 }
    const error = (message: string) => diagnostics.push({ severity: 'error', message: `Stage "${stage.id}": ${message}`, commandIndex: -1 })
    if (!Number.isFinite(c.dt) || c.dt <= 0 || !Number.isInteger(c.nSteps) || c.nSteps <= 0) error('dt must be positive and steps must be a positive integer.')
    if (c.integrator.gamma !== 0.5 || c.integrator.beta !== 0.25) error('Carapace supports Newmark gamma=0.5, beta=0.25 only.')
    if ([damping.alphaM, damping.betaK].some((v) => !Number.isFinite(v) || v < 0)) error('Damping coefficients must be finite and nonnegative.')
    if (damping.modalAnchors && (![damping.modalAnchors.mode1, damping.modalAnchors.mode2].every((v) => Number.isInteger(v) && v > 0 && v <= 0xffffffff) || !Number.isFinite(damping.modalAnchors.ratio) || damping.modalAnchors.ratio < 0 || damping.modalAnchors.ratio > 1)) error('Modal damping anchors require positive mode numbers and a ratio between 0 and 1.')
    const tags = c.patterns?.length ? c.patterns : [...model.patterns.values()].filter((p) => p.patternType === 'UniformExcitation').map((p) => p.id)
    const groundMotions: Extract<W.StageSpec, { kind: 'transient' }>['groundMotions'] = []
    for (const tag of new Set(tags)) {
      const p = model.patterns.get(tag)
      if (!p || p.patternType !== 'UniformExcitation') { error(`Pattern ${tag} must be a UniformExcitation pattern.`); continue }
      const direction = Number(p.args.dir) - 1
      if (!Number.isInteger(direction) || direction < 0 || direction >= model.config!.ndm) error(`Pattern ${tag}: direction must be between 1 and ${model.config!.ndm}.`)
      if (p.args.dispSeriesTag || p.args.velSeriesTag || Number(p.args.vel0 ?? 0) !== 0 || p.children.length) error(`Pattern ${tag}: displacement/velocity input, initial velocity and child loads are unsupported.`)
      const ts = model.timeSeries.get(Number(p.args.accelSeriesTag))
      if (!ts) { error(`Pattern ${tag}: acceleration time series is missing.`); continue }
      const scaleFactor = Number(p.args.fact ?? 1)
      if (!Number.isFinite(scaleFactor)) error(`Pattern ${tag}: factor must be finite.`)
      groundMotions.push({ direction, series: compileTimeSeries(ts, diagnostics), scaleFactor })
    }
    if (!groundMotions.length) error('Choose at least one UniformExcitation ground-motion pattern.')
    return { kind: 'transient', id: stage.id, steps: c.nSteps, dt: c.dt, damping, groundMotions, algorithm: compileAlgorithm(c.algorithm), convergence: c.convergence ? { kind: c.convergence.testType === 'NormDispIncr' ? 'normDispIncr' : c.convergence.testType === 'EnergyIncr' ? 'energyIncr' : 'normUnbalance', tol: c.convergence.tol, maxIter: c.convergence.maxIter } : undefined }
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
