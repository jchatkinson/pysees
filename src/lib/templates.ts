import type { Command } from '@/types/commands'

// ---------------------------------------------------------------------------
// Moment-Curvature
// 2D zerolength element with a fiber section:
//   300×500mm cross-section, 4 Ø20mm corner bars, Concrete01 + Steel01
// ---------------------------------------------------------------------------
export function momentCurvatureTemplate(): { ndm: 2; ndf: 3; commands: Command[] } {
  const BAR_AREA = Math.PI * 0.01 * 0.01 // Ø20mm → 3.14e-4 m²
  const commands: Command[] = [
    { type: 'ADD_NODE', id: 1, coords: [0, 0] },
    { type: 'ADD_NODE', id: 2, coords: [0, 0] },
    { type: 'FIX', nodeId: 1, dofs: [1, 2, 3] },
    // uniaxial materials: 1=Steel01, 2=Concrete01
    { type: 'ADD_MATERIAL', id: 1, matType: 'Steel01', params: [400e6, 200e9, 0.01] },
    { type: 'ADD_MATERIAL', id: 2, matType: 'Concrete01', params: [-30e6, -0.002, -6e6, -0.006] },
    // fiber section (secTag=1)
    { type: 'ADD_OPS', fn: 'section', category: 'model', values: { secType: 'Fiber', secTag: 1 } },
    // concrete patch: 300×500mm, from (-0.25,-0.15) to (0.25, 0.15) in section coords
    { type: 'ADD_OPS', fn: 'patch', category: 'model', values: { patchType: 'rect', matTag: 2, nFibZ: 8, nFibY: 8, y1: -0.25, z1: -0.15, y2: 0.25, z2: 0.15 } },
    // 4 corner steel bars (40mm cover: y=±0.21, z=±0.11)
    { type: 'ADD_OPS', fn: 'fiber', category: 'model', values: { yloc: -0.21, zloc: -0.11, A: BAR_AREA, matTag: 1 } },
    { type: 'ADD_OPS', fn: 'fiber', category: 'model', values: { yloc: -0.21, zloc: 0.11, A: BAR_AREA, matTag: 1 } },
    { type: 'ADD_OPS', fn: 'fiber', category: 'model', values: { yloc: 0.21, zloc: -0.11, A: BAR_AREA, matTag: 1 } },
    { type: 'ADD_OPS', fn: 'fiber', category: 'model', values: { yloc: 0.21, zloc: 0.11, A: BAR_AREA, matTag: 1 } },
    // zeroLengthSection element connecting nodes 1 and 2
    { type: 'ADD_OPS', fn: 'element', category: 'model', values: { eleType: 'zeroLengthSection', eleTag: 1, eleNodes: [1, 2], secTag: 1 } },
  ]
  return { ndm: 2, ndf: 3, commands }
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

export function cantileverTemplate({ n, h, eleType }: CantileverParams): { ndm: 2; ndf: 3; commands: Command[] } {
  const commands: Command[] = []
  const dy = h / n

  for (let i = 0; i <= n; i++) {
    commands.push({ type: 'ADD_NODE', id: i + 1, coords: [0, i * dy] })
  }

  commands.push({ type: 'FIX', nodeId: 1, dofs: [1, 2, 3] })

  for (let i = 0; i < n; i++) {
    commands.push({ type: 'ADD_ELEMENT', id: i + 1, eleType, nodes: [i + 1, i + 2] })
  }

  return { ndm: 2, ndf: 3, commands }
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

export function frameTemplate({ stories, storyH, bays, bayW, eleType, base }: FrameParams): { ndm: 2; ndf: 3; commands: Command[] } {
  const commands: Command[] = []
  const nodeId = (i: number, j: number) => j * (bays + 1) + i + 1

  // Nodes
  for (let j = 0; j <= stories; j++) {
    for (let i = 0; i <= bays; i++) {
      commands.push({ type: 'ADD_NODE', id: nodeId(i, j), coords: [i * bayW, j * storyH] })
    }
  }

  // Base fixity
  const fixDofs = base === 'fixed' ? [1, 2, 3] : [1, 2]
  for (let i = 0; i <= bays; i++) {
    commands.push({ type: 'FIX', nodeId: nodeId(i, 0), dofs: fixDofs })
  }

  let eleId = 1

  // Column elements (vertical)
  for (let i = 0; i <= bays; i++) {
    for (let j = 0; j < stories; j++) {
      commands.push({ type: 'ADD_ELEMENT', id: eleId++, eleType, nodes: [nodeId(i, j), nodeId(i, j + 1)] })
    }
  }

  // Beam elements (horizontal, at each story level above ground)
  for (let j = 1; j <= stories; j++) {
    for (let i = 0; i < bays; i++) {
      commands.push({ type: 'ADD_ELEMENT', id: eleId++, eleType, nodes: [nodeId(i, j), nodeId(i + 1, j)] })
    }
  }

  return { ndm: 2, ndf: 3, commands }
}
