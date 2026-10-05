import { emptyModel, type Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { cantileverTemplate, frameTemplate, momentCurvatureTemplate, type TemplateResult } from '@/app/lib/templates'

export function modelFromWrites(ndm: 2 | 3, ndf: number, writes: ModelWrite[]): Model {
  let m: Model = { ...emptyModel(), config: { ndm, ndf } }
  for (const w of writes) m = applyModelWrite(m, w)
  return m
}

export interface Fixture { name: string; model: Model; history: AnalysisHistory }

const fromTemplate = (name: string, t: TemplateResult): Fixture => ({ name, model: modelFromWrites(t.ndm, t.ndf, t.writes), history: { commands: t.analysisCommands, cursor: t.analysisCommands.length - 1 } })

/** The app's own starter models: the realistic baseline every export / import / round-trip test runs over. */
export const TEMPLATE_FIXTURES: Fixture[] = [
  fromTemplate('moment-curvature', momentCurvatureTemplate()),
  fromTemplate('cantilever-elastic', cantileverTemplate({ n: 4, h: 3, eleType: 'elasticBeamColumn' })),
  fromTemplate('cantilever-disp', cantileverTemplate({ n: 4, h: 3, eleType: 'dispBeamColumn' })),
  fromTemplate('frame-elastic', frameTemplate({ stories: 2, storyH: 3.5, bays: 2, bayW: 6, eleType: 'elasticBeamColumn', base: 'fixed' })),
  fromTemplate('frame-disp-pinned', frameTemplate({ stories: 1, storyH: 3.5, bays: 1, bayW: 6, eleType: 'dispBeamColumn', base: 'pinned' })),
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

export const ALL_FIXTURES = (): Fixture[] => [...TEMPLATE_FIXTURES, extrasFixture(), fixture3d()]

/** Models as comparable plain data: entity maps as id-sorted arrays, so deep equality ignores insertion order. */
export function plain(m: Model) {
  const sorted = <T>(map: Map<number, T>) => [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  return {
    config: m.config, nodes: sorted(m.nodes), masses: sorted(m.masses), materials: sorted(m.materials), sections: sorted(m.sections),
    geomTransfs: sorted(m.geomTransfs), beamIntegrations: sorted(m.beamIntegrations), elements: sorted(m.elements), fixes: sorted(m.fixes),
    mpConstraints: sorted(m.mpConstraints), regions: sorted(m.regions), timeSeries: sorted(m.timeSeries), patterns: sorted(m.patterns), misc: sorted(m.misc),
  }
}
