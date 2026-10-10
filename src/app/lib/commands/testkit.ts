import { emptyModel, type Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { cantileverTemplate, frameTemplate, frame3dTemplate, momentCurvatureTemplate, plateTemplate, type TemplateResult } from '@/app/lib/templates'

export function modelFromWrites(ndm: 2 | 3, ndf: number, writes: ModelWrite[]): Model {
  let m: Model = { ...emptyModel(), config: { ndm, ndf } }
  for (const w of writes) m = applyModelWrite(m, w)
  return m
}

/** `skip` names the quantities the OpenSees comparison leaves out, where the engines legitimately report different things. */
export interface Fixture { name: string; model: Model; history: AnalysisHistory; skip?: ('force')[] }

const fromTemplate = (name: string, t: TemplateResult): Fixture => ({ name, model: modelFromWrites(t.ndm, t.ndf, t.writes), history: { commands: t.analysisCommands, cursor: t.analysisCommands.length - 1 } })

/** The app's own starter models: the realistic baseline every export / import / round-trip test runs over. */
export const TEMPLATE_FIXTURES: Fixture[] = [
  fromTemplate('moment-curvature', momentCurvatureTemplate()),
  fromTemplate('cantilever-elastic', cantileverTemplate({ n: 4, h: 3, eleType: 'elasticBeamColumn' })),
  fromTemplate('cantilever-disp', cantileverTemplate({ n: 4, h: 3, eleType: 'dispBeamColumn' })),
  fromTemplate('frame-elastic', frameTemplate({ stories: 2, storyH: 3.5, bays: 2, bayW: 6, eleType: 'elasticBeamColumn', base: 'fixed' })),
  fromTemplate('frame-disp-pinned', frameTemplate({ stories: 1, storyH: 3.5, bays: 1, bayW: 6, eleType: 'dispBeamColumn', base: 'pinned' })),
  fromTemplate('frame3d-elastic', frame3dTemplate({ stories: 2, storyH: 3, baysX: 2, bayX: 5, baysY: 1, bayY: 4 })),
]

/** A model with the entities no template covers (trusses, element loads, 3D transformation, masses, constraints, inline-numbered series). */
export function extrasFixture(): Fixture {
  const model = modelFromWrites(2, 3, [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } }, { kind: 'node', entity: { id: 2, coords: [4, 0] } }, { kind: 'node', entity: { id: 3, coords: [2, 3] } },
    { kind: 'mass', entity: { nodeId: 3, values: [10, 10, 0] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2] } }, { kind: 'fix', entity: { nodeId: 2, dofs: [2] } },
    { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', e: 2e11 } } },
    { kind: 'material', entity: { id: 2, kind: 'uniaxial', matType: 'Steel01', args: { matTag: 2, matType: 'Steel01', fy: 355e6, e0: 2e11, b: 0.01 } } },
    { kind: 'element', entity: { id: 1, eleType: 'Truss', nodes: [1, 3], args: { A: 1e-3, matTag: 1 } } },
    { kind: 'element', entity: { id: 2, eleType: 'Truss', nodes: [2, 3], args: { A: 2e-3, matTag: 2 } } },
    { kind: 'mpConstraint', entity: { id: 1, kind: 'equalDOF', args: { rNodeTag: 1, cNodeTag: 2, dofs: [2] } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 2 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1.5 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [1e3, -2e3, 0] } } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'sp', args: { nodeTag: 3, dof: 1, value: 0.01 } } },
  ])
  return { name: 'extras', model, history: { commands: [], cursor: -1 } }
}

/** A 3D model (ndf 6): the 3D layouts of elasticBeamColumn and section Elastic, a transformation with vecxz and offsets, a fiber section with torsion, and 6-DOF loads. */
export function fixture3d(): Fixture {
  const model = modelFromWrites(3, 6, [
    { kind: 'node', entity: { id: 1, coords: [0, 0, 0] } }, { kind: 'node', entity: { id: 2, coords: [0, 0, 3] } }, { kind: 'node', entity: { id: 3, coords: [4, 0, 3] } },
    { kind: 'mass', entity: { nodeId: 3, values: [5, 5, 5, 0, 0, 0] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3, 4, 5, 6] } },
    { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', e: 3e10 } } },
    { kind: 'section', entity: { id: 1, secType: 'Fiber', args: { type: 'Fiber', secTag: 1, gJ: 1e6 }, children: [] } },
    { kind: 'sectionChild', sectionId: 1, child: { kind: 'patch', subType: 'rect', args: { matTag: 1, numSubdivY: 4, numSubdivZ: 4, y1: -0.2, z1: -0.2, y2: 0.2, z2: 0.2 } } },
    { kind: 'section', entity: { id: 2, secType: 'Elastic', args: { type: 'Elastic', secTag: 2, eMod: 2e11, a: 0.01, iz: 1e-4, iy: 2e-4, gMod: 8e10, jxx: 3e-4 }, children: [] } },
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1, vecxz: [1, 0, 0] } } },
    { kind: 'geomTransf', entity: { id: 2, transfType: 'PDelta', args: { type: 'PDelta', transfTag: 2, vecxz: [0, 0, 1], dI: [0.1, 0, 0], dJ: [0, 0.1, 0] } } },
    { kind: 'beamIntegration', entity: { id: 1, intType: 'Legendre', args: { type: 'Legendre', tag: 1, secTag: 1, n: 3 } } },
    { kind: 'element', entity: { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { A: 0.04, E: 3e10, G: 1.2e10, J: 1e-3, Iy: 1.3e-4, Iz: 1.3e-4, transfTag: 1 } } },
    { kind: 'element', entity: { id: 2, eleType: 'DispBeamColumn', nodes: [2, 3], args: { transfTag: 2, integrationTag: 1 } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [1e3, 0, -2e3, 0, 0, 0] } } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'eleLoad', args: { eleTags: [1], wx: 0.5, wy: -1, wz: -2 } } },
  ])
  return { name: '3d-frame', model, history: { commands: [], cursor: -1 } }
}

/** Z-up 3D cantilevers (fixed at node 1, two elements) for comparing Carapace against OpenSees. The elastic one has unequal Iy/Iz, a transverse element load in each local direction and a
 * tip load on all six DOFs, so every component of the 12-wide local force is non-zero. The fiber one is pushed in X until it yields (biaxial fiber section, `-GJ` torsion). */
export function cantilever3dFixtures(): Fixture[] {
  const recorder = { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } } as const
  const geometry = (eleType: string, args: Record<string, unknown>): ModelWrite[] => [
    { kind: 'node', entity: { id: 1, coords: [0, 0, 0] } }, { kind: 'node', entity: { id: 2, coords: [0, 0, 2] } }, { kind: 'node', entity: { id: 3, coords: [0, 0, 4] } },
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3, 4, 5, 6] } },
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1, vecxz: [1, 0, 0] } } },
    { kind: 'element', entity: { id: 1, eleType, nodes: [1, 2], args } }, { kind: 'element', entity: { id: 2, eleType, nodes: [2, 3], args } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
  ]
  const elastic: ModelWrite[] = [
    ...geometry('ElasticBeamColumn', { A: 0.04, E: 3e10, G: 1.2e10, J: 1.5e-3, Iy: 8e-5, Iz: 2e-4, transfTag: 1 }),
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [1e4, 2e4, -5e4, 3e3, 4e3, 5e3] } } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'eleLoad', args: { eleTags: [1, 2], wx: 500, wy: -3e3, wz: 2e3 } } },
  ]
  const fiberWrites: ModelWrite[] = [
    ...geometry('DispBeamColumn', { transfTag: 1, integrationTag: 1 }),
    { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Steel01', args: { matTag: 1, matType: 'Steel01', fy: 400e6, e0: 200e9, b: 0.01 } } },
    { kind: 'material', entity: { id: 2, kind: 'uniaxial', matType: 'Concrete01', args: { matTag: 2, matType: 'Concrete01', fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006 } } },
    { kind: 'section', entity: { id: 1, secType: 'Fiber', args: { type: 'Fiber', secTag: 1, gJ: 1e7 }, children: [
      { kind: 'patch', subType: 'rect', args: { matTag: 2, numSubdivY: 6, numSubdivZ: 4, y1: -0.25, z1: -0.2, y2: 0.25, z2: 0.2 } },
      ...[[-0.2, -0.15], [-0.2, 0.15], [0.2, -0.15], [0.2, 0.15]].map(([yloc, zloc]) => ({ kind: 'fiber' as const, subType: 'fiber', args: { yloc, zloc, A: 3e-4, matTag: 1 } })),
    ] } },
    { kind: 'beamIntegration', entity: { id: 1, intType: 'Legendre', args: { type: 'Legendre', tag: 1, secTag: 1, n: 3 } } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [1, 0, 0, 0, 0, 0] } } },
  ]
  return [
    { name: 'cantilever3d-elastic', model: modelFromWrites(3, 6, elastic), history: { commands: [recorder, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 4 } }], cursor: 1 } },
    { name: 'cantilever3d-fiber-pushover', model: modelFromWrites(3, 6, fiberWrites), history: { commands: [recorder, { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns: [1], nodeTag: 3, dof: 1, increment: 0.0016, steps: 60 } }], cursor: 1 } },
  ]
}

/** Planar trusses with analysis, for comparing Carapace against OpenSees: one stays elastic, one yields (Steel01) under a displacement-controlled push. */
export function trussFixtures(): Fixture[] {
  const base = (matType: 'Elastic' | 'Steel01') => [
    { kind: 'node', entity: { id: 1, coords: [0, 0] } }, { kind: 'node', entity: { id: 2, coords: [4, 0] } }, { kind: 'node', entity: { id: 3, coords: [2, 3] } },
    // A truss has no rotational stiffness, so every node's rotation is restrained.
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } }, { kind: 'fix', entity: { nodeId: 2, dofs: [2, 3] } }, { kind: 'fix', entity: { nodeId: 3, dofs: [3] } },
    { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType, args: matType === 'Elastic' ? { matTag: 1, matType, e: 2e11 } : { matTag: 1, matType, fy: 355e6, e0: 2e11, b: 0.02 } } },
    { kind: 'element', entity: { id: 1, eleType: 'Truss', nodes: [1, 3], args: { A: 1e-3, matTag: 1 } } },
    { kind: 'element', entity: { id: 2, eleType: 'Truss', nodes: [2, 3], args: { A: 1e-3, matTag: 1 } } },
    { kind: 'element', entity: { id: 3, eleType: 'Truss', nodes: [1, 2], args: { A: 5e-4, matTag: 1 } } },
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 3, values: [2e4, -1e5, 0] } } },
  ] as ModelWrite[]
  const recorder = { type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } } as const
  return [
    { name: 'truss-elastic', model: modelFromWrites(2, 3, base('Elastic')), history: { commands: [recorder, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 5 } }], cursor: 1 } },
    { name: 'truss-yielding', model: modelFromWrites(2, 3, base('Steel01')), history: { commands: [recorder, { type: 'ANALYSIS_BLOCK', blockId: 'run-pushover-analysis', params: { patterns: [1], nodeTag: 3, dof: 2, increment: -0.0004, steps: 60 } }], cursor: 1 } },
  ]
}

/** Two distorted ShellMITC4 quads on the tilted plane z = 0.3x + 0.1y, clamped at nodes 1 and 4, loaded at nodes 5 and 6; `selfWeight` and `pressure` add shell loads on top.
 * With `triangle`, a ShellDKGT hangs off node 6 (valid in OpenSees; Carapace does not support it yet). */
function shellWrites({ selfWeight = false, pressure = false, triangle = false } = {}): ModelWrite[] {
  const xy = [[0, 0], [2, 0.2], [2.3, 1.7], [-0.1, 1.4], [4.2, 0.1], [4.5, 1.6], [6, 0.9]]
  // The triangle takes the loads only with a pressure (self-weight on a ShellDKGT is exported as nodal loads, so it cannot be read back).
  const loaded = triangle && pressure ? [1, 2, 3] : [1, 2]
  const nodes = xy.slice(0, triangle ? 7 : 6).map(([x, y], i): ModelWrite => ({ kind: 'node', entity: { id: i + 1, coords: [x, y, 0.3 * x + 0.1 * y] } }))
  return [
    ...nodes,
    { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3, 4, 5, 6] } }, { kind: 'fix', entity: { nodeId: 4, dofs: [1, 2, 3, 4, 5, 6] } },
    { kind: 'section', entity: { id: 1, secType: 'ElasticMembranePlateSection', args: { type: 'ElasticMembranePlateSection', secTag: 1, eMod: 3e4, nu: 0.25, h: 0.4, rho: 2e-3 }, children: [] } },
    { kind: 'element', entity: { id: 1, eleType: 'ShellMITC4', nodes: [1, 2, 3, 4], args: { secTag: 1 } } },
    { kind: 'element', entity: { id: 2, eleType: 'ShellMITC4', nodes: [2, 5, 6, 3], args: { secTag: 1 } } },
    ...(triangle ? [{ kind: 'element', entity: { id: 3, eleType: 'ShellDKGT', nodes: [5, 7, 6], args: { secTag: 1 } } } as ModelWrite] : []),
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 5, values: [1, -2, 3, 0.5, -0.7, 0.2] } } },
    { kind: 'patternChild', patternId: 1, child: { kind: 'load', args: { nodeTag: 6, values: [-0.5, 1.5, -4, 0.1, 0.3, -0.9] } } },
    ...(selfWeight ? [{ kind: 'patternChild', patternId: 1, child: { kind: 'eleLoad', args: { eleTags: loaded, loadType: 'Shell self-weight', bx: 0, by: 0, bz: -9.81 } } } as ModelWrite] : []),
    ...(pressure ? [{ kind: 'patternChild', patternId: 1, child: { kind: 'eleLoad', args: { eleTags: loaded, loadType: 'Shell pressure', pressure: 0.35 } } } as ModelWrite] : []),
  ]
}

/** Shell elements and their self-weight, round-trippable (a shell pressure is exported as nodal loads, so it cannot be read back). */
export function shellFixture(): Fixture {
  return { name: '3d-shells', model: modelFromWrites(3, 6, shellWrites({ selfWeight: true, triangle: true })), history: { commands: [], cursor: -1 } }
}

/** A shell pressure: exported as the equivalent nodal loads, so it is in the golden files and the OpenSees comparison but not the round-trip test. */
export function shellPressureFixture(): Fixture {
  return { name: '3d-shell-pressure', model: modelFromWrites(3, 6, shellWrites({ selfWeight: true, pressure: true })), history: { commands: [], cursor: -1 } }
}

/** Shell models with analysis, for comparing Carapace against OpenSees: point loads, then self-weight and pressure on top. */
export function shellFixtures(): Fixture[] {
  const commands = [{ type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } }, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 2 } }] as const
  return [
    { name: 'shell-patch-with-triangle', model: modelFromWrites(3, 6, shellWrites({ triangle: true, selfWeight: true, pressure: true })), history: { commands: [...commands], cursor: 1 }, skip: ['force'] },
    { name: 'shell-patch', model: modelFromWrites(3, 6, shellWrites()), history: { commands: [...commands], cursor: 1 } },
    // Carapace reports a loaded element's force net of its element load (like a beam's end forces with the fixed-end effect); OpenSees has no shell
    // pressure (the export expands it to nodal loads, which are not part of any element), so the element forces differ by exactly the pressure load.
    { name: 'shell-patch-self-weight-pressure', model: modelFromWrites(3, 6, shellWrites({ selfWeight: true, pressure: true })), history: { commands: [...commands], cursor: 1 }, skip: ['force'] },
  ]
}

/** The plate starter model (self-weight and pressure). Its element forces are left out of the OpenSees comparison like any pressured shell's. */
export const plateFixture = (): Fixture => ({ ...fromTemplate('plate', plateTemplate({ nx: 4, ny: 2, lx: 4, ly: 2, h: 0.2 })), skip: ['force'] })

export const ALL_FIXTURES = (): Fixture[] => [...TEMPLATE_FIXTURES, extrasFixture(), fixture3d(), shellFixture()]

/** Models as comparable plain data: entity maps as id-sorted arrays, so deep equality ignores insertion order. */
export function plain(m: Model) {
  const sorted = <T>(map: Map<number, T>) => [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  return {
    config: m.config, nodes: sorted(m.nodes), masses: sorted(m.masses), materials: sorted(m.materials), sections: sorted(m.sections),
    geomTransfs: sorted(m.geomTransfs), beamIntegrations: sorted(m.beamIntegrations), elements: sorted(m.elements), fixes: sorted(m.fixes),
    mpConstraints: sorted(m.mpConstraints), regions: sorted(m.regions), timeSeries: sorted(m.timeSeries), patterns: sorted(m.patterns), misc: sorted(m.misc),
  }
}
