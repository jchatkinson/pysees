import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import { alphaLabel, evenlySpacedGridlines } from '@/app/lib/gridlines'

export interface TemplateResult {
  ndm: 2 | 3
  ndf: number
  writes: ModelWrite[]
  analysisCommands: AnalysisCommand[]
  /** Optional UI-only reference grids the template suggests (no OpenSeesPy equivalent). */
  gridlines?: GridlineEntity[]
  /** Optional UI-only story levels the template suggests (no OpenSeesPy equivalent). */
  levels?: LevelEntity[]
}

/** A one-pattern Plain/Linear static load, registered before a "Whole Model Recorder" +
 * "Run Gravity Analysis" block pair — the minimum a template needs to be immediately
 * runnable (script export or Carapace) with recorded output, not just a bare geometry. */
function staticLoadAnalysis(
  loadNode: number,
  loadValues: number[],
  steps = 10,
): { writes: ModelWrite[]; analysisCommands: AnalysisCommand[] } {
  const patternId = 1
  const tsId = 1
  return {
    writes: [
      { kind: 'timeSeries', entity: { id: tsId, tsType: 'Linear', args: { tag: tsId, factor: 1 } } },
      { kind: 'pattern', entity: { id: patternId, patternType: 'Plain', args: { patternTag: patternId, tsTag: tsId, fact: 1 }, children: [] } },
      { kind: 'patternChild', patternId, child: { kind: 'load', args: { nodeTag: loadNode, values: loadValues } } },
    ],
    analysisCommands: [
      { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
      { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { steps } },
    ],
  }
}

// ---------------------------------------------------------------------------
// Moment-Curvature
// 2D zerolength element with a fiber section:
//   300×500mm cross-section, 4 Ø20mm corner bars, Concrete01 + Steel01
// ---------------------------------------------------------------------------
export function momentCurvatureTemplate(): TemplateResult {
  const BAR_AREA = Math.PI * 0.01 * 0.01 // Ø20mm → 3.14e-4 m²
  const AXIAL_LOAD = -800e3 // N, compression — ~18% of gross axial capacity for this section
  const writes: ModelWrite[] = [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } },
    { kind: 'node', entity: { id: 2, coords: [0, 0] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } },
    { kind: 'fix', entity: { nodeId: 2, dofs: [2] } }, // restrain shear DOF — the section has no shear stiffness
    { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Steel01', args: { matTag: 1, matType: 'Steel01', Fy: 400e6, E0: 200e9, b: 0.01 } } },
    { kind: 'material', entity: { id: 2, kind: 'uniaxial', matType: 'Concrete01', args: { matTag: 2, matType: 'Concrete01', fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006 } } },
    { kind: 'section', entity: { id: 1, secType: 'Fiber', args: { secTag: 1, type: 'Fiber' }, children: [
      { kind: 'patch', subType: 'rect', args: { matTag: 2, numSubdivY: 8, numSubdivZ: 8, y1: -0.25, z1: -0.15, y2: 0.25, z2: 0.15 } },
      { kind: 'fiber', subType: 'fiber', args: { yloc: -0.21, zloc: -0.11, A: BAR_AREA, matTag: 1 } },
      { kind: 'fiber', subType: 'fiber', args: { yloc: -0.21, zloc: 0.11, A: BAR_AREA, matTag: 1 } },
      { kind: 'fiber', subType: 'fiber', args: { yloc: 0.21, zloc: -0.11, A: BAR_AREA, matTag: 1 } },
      { kind: 'fiber', subType: 'fiber', args: { yloc: 0.21, zloc: 0.11, A: BAR_AREA, matTag: 1 } },
    ] } },
    { kind: 'element', entity: { id: 1, eleType: 'zeroLengthSection', nodes: [1, 2], args: { secTag: 1 } } },
  ]

  writes.push(
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 2, values: [AXIAL_LOAD, 0, 0] } } },
    // A second, deliberately separate pattern carrying a *unit* moment at the same DOF the
    // pushover stage sweeps: `DisplacementControl` picks each step's load factor from the
    // tangent's response to this pattern's reference load (core's "unit-load technique"), which
    // is exactly zero if no pattern applies anything at that DOF — and pattern 1 can't stand in
    // for it, since gravity's own stage freezes pattern 1 (holds the axial load constant) before
    // the pushover stage runs, and a frozen pattern stops contributing sensitivity entirely. Its
    // magnitude is arbitrary (only its *direction* matters to the unit-load technique) — 1 is the
    // usual OpenSeesPy moment-curvature convention.
    { kind: 'timeSeries', entity: { id: 2, tsType: 'Linear', args: { tag: 2, factor: 1 } } },
    { kind: 'pattern', entity: { id: 2, patternType: 'Plain', args: { patternTag: 2, tsTag: 2, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 2, child: { kind: 'load', args: { nodeTag: 2, values: [0, 0, 1] } } },
  )

  // Standard two-stage moment-curvature protocol: hold axial load constant, then sweep
  // curvature via rotation (DOF 3) displacement control at the free node. `holdPatterns: [1]`
  // freezes only the axial pattern — the unit-moment pattern (2) must stay live into the
  // pushover stage (see the comment on it above).
  const analysisCommands: AnalysisCommand[] = [
    { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { steps: 10, holdPatterns: [1] } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { nodeTag: 2, dof: 3, increment: 1e-4, steps: 200 } },
  ]

  return { ndm: 2, ndf: 3, writes, analysisCommands }
}

/** Cross-section geometry shared by an `eleType`-parameterized template's member: an elastic
 * `A`/`E`/`Iz` for `elasticBeamColumn`, or (for `dispBeamColumn`) a `Fiber` section carrying one
 * rectangular patch sized to that exact same `A`/`Iz` (`height` from `Iz/A = height^2/12`,
 * `width = A/height`) plus a `Legendre` `beamIntegration` referencing it — same member stiffness,
 * but actually exercised through Carapace's nonlinear fiber element (`carapace/wasm-bridge`'s
 * `DispBeamColumn`) instead of silently building an elastic one regardless of the caller's
 * choice. `matTag`/`transfTag`/`sectionId`/`integrationId` are shared across every element the
 * caller builds from the returned args — one section/integration per template call, not one per
 * element, since every member here shares the same cross-section. */
function beamMemberArgs(
  writes: ModelWrite[],
  eleType: 'elasticBeamColumn' | 'dispBeamColumn',
  section: { A: number; E: number; Iz: number },
  ids: { matTag: number; transfTag: number; sectionId: number; integrationId: number },
): { eleType: string; args: Record<string, unknown> } {
  if (eleType === 'elasticBeamColumn') {
    return { eleType: 'ElasticBeamColumn', args: { A: section.A, E: section.E, Iz: section.Iz, transfTag: ids.transfTag } }
  }
  const height = Math.sqrt((12 * section.Iz) / section.A)
  const width = section.A / height
  writes.push(
    { kind: 'section', entity: { id: ids.sectionId, secType: 'Fiber', args: { secTag: ids.sectionId, type: 'Fiber' }, children: [
      { kind: 'patch', subType: 'rect', args: { matTag: ids.matTag, numSubdivY: 10, numSubdivZ: 1, y1: -height / 2, z1: -width / 2, y2: height / 2, z2: width / 2 } },
    ] } },
    { kind: 'beamIntegration', entity: { id: ids.integrationId, intType: 'Legendre', args: { tag: ids.integrationId, secTag: ids.sectionId, n: 4 } } },
  )
  return { eleType: 'DispBeamColumn', args: { transfTag: ids.transfTag, integrationTag: ids.integrationId } }
}

// ---------------------------------------------------------------------------
// Cantilever Column
// 2D, n elements stacked in y direction, fixed base at y=0
// ---------------------------------------------------------------------------
export interface CantileverParams {
  n: number
  h: number
  eleType: 'elasticBeamColumn' | 'dispBeamColumn'
}

export function cantileverTemplate({ n, h, eleType }: CantileverParams): TemplateResult {
  const writes: ModelWrite[] = []
  const dy = h / n

  for (let i = 0; i <= n; i++) {
    writes.push({ kind: 'node', entity: { id: i + 1, coords: [0, i * dy] } })
  }
  writes.push({ kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } })
  writes.push({ kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } })
  writes.push({ kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', E: 200e9 } } })

  const member = beamMemberArgs(writes, eleType, { A: 0.01, E: 200e9, Iz: 1e-4 }, { matTag: 1, transfTag: 1, sectionId: 1, integrationId: 1 })
  for (let i = 0; i < n; i++) {
    writes.push({
      kind: 'element',
      entity: { id: i + 1, eleType: member.eleType, nodes: [i + 1, i + 2], args: member.args },
    })
  }

  // Lateral point load at the tip.
  const tipNode = n + 1
  const analysis = staticLoadAnalysis(tipNode, [10e3, 0, 0])

  return { ndm: 2, ndf: 3, writes: [...writes, ...analysis.writes], analysisCommands: analysis.analysisCommands }
}

// ---------------------------------------------------------------------------
// 2D Frame
// ndm=2, stories × bays grid, columns + beams, fixed or pinned base
// Node numbering: id = j*(bays+1) + i + 1, coords = [i*bayW, j*storyH]
//   i = bay column index (0..bays), j = story index (0..stories)
// ---------------------------------------------------------------------------
export interface FrameParams {
  stories: number
  storyH: number
  bays: number
  bayW: number
  eleType: 'elasticBeamColumn' | 'dispBeamColumn'
  base: 'fixed' | 'pinned'
}

export function frameTemplate({ stories, storyH, bays, bayW, eleType, base }: FrameParams): TemplateResult {
  const writes: ModelWrite[] = []
  const nodeId = (i: number, j: number) => j * (bays + 1) + i + 1

  for (let j = 0; j <= stories; j++) {
    for (let i = 0; i <= bays; i++) {
      writes.push({ kind: 'node', entity: { id: nodeId(i, j), coords: [i * bayW, j * storyH] } })
    }
  }

  const fixDofs = base === 'fixed' ? [1, 2, 3] : [1, 2]
  for (let i = 0; i <= bays; i++) {
    writes.push({ kind: 'fix', entity: { nodeId: nodeId(i, 0), dofs: fixDofs } })
  }

  writes.push({ kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } })
  writes.push({ kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', E: 200e9 } } })
  const member = beamMemberArgs(writes, eleType, { A: 0.01, E: 200e9, Iz: 1e-4 }, { matTag: 1, transfTag: 1, sectionId: 1, integrationId: 1 })
  let eleId = 1

  for (let i = 0; i <= bays; i++) {
    for (let j = 0; j < stories; j++) {
      writes.push({ kind: 'element', entity: { id: eleId++, eleType: member.eleType, nodes: [nodeId(i, j), nodeId(i, j + 1)], args: member.args } })
    }
  }
  for (let j = 1; j <= stories; j++) {
    for (let i = 0; i < bays; i++) {
      writes.push({ kind: 'element', entity: { id: eleId++, eleType: member.eleType, nodes: [nodeId(i, j), nodeId(i + 1, j)], args: member.args } })
    }
  }

  // Reference grids: one numbered column line per bay (plan position only — a 2D
  // model has no depth, so a grid is just an X value; its vertical extent is
  // derived from the levels below, not stored on the grid itself).
  const gridlines = evenlySpacedGridlines({
    axis: 0,
    offset: 0,
    spacing: bayW,
    count: bays + 1,
    spanStart: [0],
    spanEnd: [0],
    labelStyle: 'numeric',
    labelPrefix: '',
    startIndex: 1,
  }, 1)

  // Reference levels: ground (height 0) plus one lettered level per story.
  const levels: LevelEntity[] = [{ id: 1, label: 'A', height: 0 }]
  for (let j = 1; j <= stories; j++) {
    levels.push({ id: j + 1, label: alphaLabel(j), height: storyH })
  }

  // Lateral point load at the roof, leeward corner.
  const roofNode = nodeId(bays, stories)
  const analysis = staticLoadAnalysis(roofNode, [10e3 * stories, 0, 0])

  return { ndm: 2, ndf: 3, writes: [...writes, ...analysis.writes], analysisCommands: analysis.analysisCommands, gridlines, levels }
}
