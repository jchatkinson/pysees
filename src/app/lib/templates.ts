import type { AnalysisCommand } from '@/app/types/analysisCommands'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { LoadAssignment } from '@/app/types/model'
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

const PUSHOVER_STEPS = 100

// Frame gravity loads: psf area loads over a 6 m tributary (out-of-plane bay) width, in SI (N/m).
const PSF_TO_PA = 47.8803
const TRIBUTARY_WIDTH = 6
const DEAD_PSF = 25
const LIVE_PSF = 40

/** A one-pattern Plain/Linear static load, registered before a "Whole Model Recorder" +
 * "Run Gravity Analysis" block pair — the minimum a template needs to be immediately
 * runnable (script export or Carapace) with recorded output, not just a bare geometry.
 * With `pushoverTo` (a displacement of the loaded node along DOF 1) the load only sets the
 * direction and the stage is a displacement-controlled pushover to that displacement instead —
 * needed to follow a nonlinear member past yield, which load control cannot. */
function staticLoadAnalysis(
  loadNode: number,
  loadValues: number[],
  steps = 10,
  pushoverTo?: number,
): { writes: ModelWrite[]; analysisCommands: AnalysisCommand[] } {
  const patternId = 1
  const tsId = 1
  return {
    writes: [
      { kind: 'timeSeries', entity: { id: tsId, tsType: 'Linear', args: { type: 'Linear', tag: tsId, factor: 1 } } },
      { kind: 'pattern', entity: { id: patternId, patternType: 'Plain', args: { type: 'Plain', patternTag: patternId, tsTag: tsId, fact: 1 }, children: [] } },
      { kind: 'patternChild', patternId, child: { kind: 'load', args: { nodeTag: loadNode, values: loadValues } } },
    ],
    analysisCommands: [
      { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
      pushoverTo === undefined
        ? { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [patternId], steps } }
        : { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns: [patternId], nodeTag: loadNode, dof: 1, increment: pushoverTo / PUSHOVER_STEPS, steps: PUSHOVER_STEPS } },
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
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 2, values: [AXIAL_LOAD, 0, 0] } } },
    // A second, deliberately separate pattern carrying a *unit* moment at the same DOF the
    // pushover stage sweeps: `DisplacementControl` picks each step's load factor from the
    // tangent's response to this pattern's reference load (core's "unit-load technique"), which
    // is exactly zero if no pattern applies anything at that DOF — and pattern 1 can't stand in
    // for it, since gravity's own stage freezes pattern 1 (holds the axial load constant) before
    // the pushover stage runs, and a frozen pattern stops contributing sensitivity entirely. Its
    // magnitude is arbitrary (only its *direction* matters to the unit-load technique) — 1 is the
    // usual OpenSeesPy moment-curvature convention.
    { kind: 'timeSeries', entity: { id: 2, tsType: 'Linear', args: { type: 'Linear', tag: 2, factor: 1 } } },
    { kind: 'pattern', entity: { id: 2, patternType: 'Plain', args: { type: 'Plain', patternTag: 2, tsTag: 2, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 2, child: { kind: 'load', args: { nodeTag: 2, values: [0, 0, 1] } } },
  )

  // Standard two-stage moment-curvature protocol: hold axial load constant, then sweep
  // curvature via rotation (DOF 3) displacement control at the free node. `patterns: [1]`
  // freezes only the axial pattern — the unit-moment pattern (2) must stay live into the
  // pushover stage (see the comment on it above).
  const analysisCommands: AnalysisCommand[] = [
    { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 10 } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns: [2], nodeTag: 2, dof: 3, increment: 1e-4, steps: 200 } },
  ]

  return { ndm: 2, ndf: 3, writes, analysisCommands }
}

/** Reinforced-concrete member section for the `dispBeamColumn` option: 400×400 mm, 8 Ø20 bars with
 * 40 mm cover, unconfined Concrete01 (f'c 30 MPa) + Steel01 (Fy 400 MPa). SI units (N, m). */
const RC_SECTION = { b: 0.4, h: 0.4, barArea: Math.PI * 0.01 * 0.01, barOffset: 0.15 }

/** The member `eleType`/`args` a template builds its elements from. `elasticBeamColumn` takes the
 * elastic `A`/`E`/`Iz`; `dispBeamColumn` registers the RC fiber section above (Steel01 as material 1,
 * Concrete01 as material 2) plus a `Legendre` `beamIntegration` referencing it, and runs through
 * Carapace's nonlinear `DispBeamColumn`. One section/integration per template call, not one per
 * element, since every member shares the same cross-section. */
function beamMemberArgs(
  writes: ModelWrite[],
  eleType: 'elasticBeamColumn' | 'dispBeamColumn',
  section: { A: number; E: number; Iz: number },
  ids: { transfTag: number; sectionId: number; integrationId: number },
): { eleType: string; args: Record<string, unknown> } {
  if (eleType === 'elasticBeamColumn') {
    return { eleType: 'ElasticBeamColumn', args: { A: section.A, E: section.E, Iz: section.Iz, transfTag: ids.transfTag } }
  }
  const { b, h, barArea, barOffset } = RC_SECTION
  const bars = [-barOffset, 0, barOffset].flatMap((y) => [-barOffset, 0, barOffset].filter((z) => y !== 0 || z !== 0).map((z) => ({ y, z })))
  writes.push(
    { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Steel01', args: { matTag: 1, matType: 'Steel01', Fy: 400e6, E0: 200e9, b: 0.01 } } },
    { kind: 'material', entity: { id: 2, kind: 'uniaxial', matType: 'Concrete01', args: { matTag: 2, matType: 'Concrete01', fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006 } } },
    { kind: 'section', entity: { id: ids.sectionId, secType: 'Fiber', args: { secTag: ids.sectionId, type: 'Fiber' }, children: [
      { kind: 'patch', subType: 'rect', args: { matTag: 2, numSubdivY: 8, numSubdivZ: 8, y1: -h / 2, z1: -b / 2, y2: h / 2, z2: b / 2 } },
      ...bars.map(({ y, z }) => ({ kind: 'fiber' as const, subType: 'fiber', args: { yloc: y, zloc: z, A: barArea, matTag: 1 } })),
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
  if (eleType === 'elasticBeamColumn') writes.push({ kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', E: 200e9 } } })

  const member = beamMemberArgs(writes, eleType, { A: 0.01, E: 200e9, Iz: 1e-4 }, { transfTag: 1, sectionId: 1, integrationId: 1 })
  for (let i = 0; i < n; i++) {
    writes.push({
      kind: 'element',
      entity: { id: i + 1, eleType: member.eleType, nodes: [i + 1, i + 2], args: member.args },
    })
  }

  // Lateral point load at the tip. The RC member is pushed to 4% drift (yield is around 1.3%) so the
  // response actually shows cracking, yielding and hardening; the elastic one just takes the load.
  const tipNode = n + 1
  const analysis = staticLoadAnalysis(tipNode, [10e3, 0, 0], 10, eleType === 'dispBeamColumn' ? 0.04 * h : undefined)

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
  if (eleType === 'elasticBeamColumn') writes.push({ kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', E: 200e9 } } })
  const member = beamMemberArgs(writes, eleType, { A: 0.01, E: 200e9, Iz: 1e-4 }, { transfTag: 1, sectionId: 1, integrationId: 1 })
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

  // Three Plain patterns sharing one Linear series: dead + live as uniform beam loads (kN/m from an
  // area load over a tributary width, applied as -wy in the beams' local y, i.e. downward), and an
  // inverted-triangle lateral push on every floor node. Gravity stage ramps dead + live and holds them; the
  // push stage then follows. The RC frame is pushed to 3% roof drift so the response shows
  // yielding; the elastic one just takes the load.
  const beamTags = Array.from({ length: bays * stories }, (_, k) => (bays + 1) * stories + k + 1)
  const roofNode = nodeId(bays, stories)
  // Inverted-triangle push: every node on story level j takes j kN in +X (1 kN at the first floor up to `stories` kN at the roof).
  const pushLoads: LoadAssignment[] = []
  for (let j = 1; j <= stories; j++) for (let i = 0; i <= bays; i++) pushLoads.push({ kind: 'load', args: { nodeTag: nodeId(i, j), values: [1e3 * j, 0, 0] } })
  const pattern = (id: number, name: string, children: LoadAssignment[]): ModelWrite =>
    ({ kind: 'pattern', entity: { id, name, patternType: 'Plain', args: { type: 'Plain', patternTag: id, tsTag: 1, fact: 1 }, children } })
  const areaLoad = (psf: number): LoadAssignment[] => [{ kind: 'eleLoad', args: { eleTags: beamTags, wy: -psf * PSF_TO_PA * TRIBUTARY_WIDTH, wz: 0 } }]
  const loadWrites: ModelWrite[] = [
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    pattern(1, 'Dead Load', areaLoad(DEAD_PSF)),
    pattern(2, 'Live Load', areaLoad(LIVE_PSF)),
    pattern(3, 'Push', pushLoads),
  ]
  const pushStage: AnalysisCommand = eleType === 'dispBeamColumn'
    ? { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns: [3], nodeTag: roofNode, dof: 1, increment: 0.03 * stories * storyH / PUSHOVER_STEPS, steps: PUSHOVER_STEPS } }
    : { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [3], steps: 10 } }
  const analysisCommands: AnalysisCommand[] = [
    { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } },
    { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1, 2], steps: 10 } },
    pushStage,
  ]

  return { ndm: 2, ndf: 3, writes: [...writes, ...loadWrites], analysisCommands, gridlines, levels }
}
