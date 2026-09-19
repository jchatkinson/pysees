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

// ---------------------------------------------------------------------------
// Moment-Curvature
// 2D zerolength element with a fiber section:
//   300×500mm cross-section, 4 Ø20mm corner bars, Concrete01 + Steel01
// ---------------------------------------------------------------------------
export function momentCurvatureTemplate(): TemplateResult {
  const BAR_AREA = Math.PI * 0.01 * 0.01 // Ø20mm → 3.14e-4 m²
  const writes: ModelWrite[] = [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } },
    { kind: 'node', entity: { id: 2, coords: [0, 0] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } },
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
  return { ndm: 2, ndf: 3, writes, analysisCommands: [] }
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

export function cantileverTemplate({ n, h }: CantileverParams): TemplateResult {
  const writes: ModelWrite[] = []
  const dy = h / n

  for (let i = 0; i <= n; i++) {
    writes.push({ kind: 'node', entity: { id: i + 1, coords: [0, i * dy] } })
  }
  writes.push({ kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } })
  writes.push({ kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } })
  writes.push({ kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', E: 200e9 } } })

  for (let i = 0; i < n; i++) {
    writes.push({
      kind: 'element',
      entity: { id: i + 1, eleType: 'ElasticBeamColumn', nodes: [i + 1, i + 2], args: { A: 0.01, E: 200e9, Iz: 1e-4, transfTag: 1 } },
    })
  }

  return { ndm: 2, ndf: 3, writes, analysisCommands: [] }
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

export function frameTemplate({ stories, storyH, bays, bayW, base }: FrameParams): TemplateResult {
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
  const eleArgs = { A: 0.01, E: 200e9, Iz: 1e-4, transfTag: 1 }
  let eleId = 1

  for (let i = 0; i <= bays; i++) {
    for (let j = 0; j < stories; j++) {
      writes.push({ kind: 'element', entity: { id: eleId++, eleType: 'ElasticBeamColumn', nodes: [nodeId(i, j), nodeId(i, j + 1)], args: eleArgs } })
    }
  }
  for (let j = 1; j <= stories; j++) {
    for (let i = 0; i < bays; i++) {
      writes.push({ kind: 'element', entity: { id: eleId++, eleType: 'ElasticBeamColumn', nodes: [nodeId(i, j), nodeId(i + 1, j)], args: eleArgs } })
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

  return { ndm: 2, ndf: 3, writes, analysisCommands: [], gridlines, levels }
}
