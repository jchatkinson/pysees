import { describe, expect, it } from 'vitest'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { AnalysisHistory } from '@/app/types/analysisCommands'

/**
 * Anything the Carapace compiler can't express must surface as a diagnostic, never degrade silently (AGENTS.md, Key constraints). Each
 * row is a small model using one unsupported feature and the diagnostic it must raise. The supported side of each feature is compared
 * against OpenSees in the verification cases.
 */
const history: AnalysisHistory = { commands: [{ type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: {} }, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 1 } }], cursor: 1 }
const n = (id: number, coords: number[]): ModelWrite => ({ kind: 'node', entity: { id, coords } })
const pattern = (children: { kind: 'load' | 'sp'; args: Record<string, unknown> }[] = [], type = 'Plain'): ModelWrite[] => [
  { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
  { kind: 'pattern', entity: { id: 1, patternType: type, args: { type, patternTag: 1, tsTag: 1, fact: 1 }, children: [] } },
  ...children.map((child): ModelWrite => ({ kind: 'patternChild', patternId: 1, child })),
]
const frame2 = (extra: ModelWrite[], transfType = 'Linear', transfArgs: Record<string, unknown> = {}): ModelWrite[] => [
  n(1, [0, 0]), n(2, [0, 3]), { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } },
  { kind: 'geomTransf', entity: { id: 1, transfType, args: { type: transfType, transfTag: 1, ...transfArgs } } }, ...extra, ...pattern([{ kind: 'load', args: { nodeTag: 2, values: [1, 0, 0] } }]),
]
const frame3 = (extra: ModelWrite[], transfType = 'Linear'): ModelWrite[] => [
  n(1, [0, 0, 0]), n(2, [0, 0, 3]), { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3, 4, 5, 6] } },
  { kind: 'geomTransf', entity: { id: 1, transfType, args: { type: transfType, transfTag: 1, vecxz: [1, 0, 0] } } }, ...extra, ...pattern([{ kind: 'load', args: { nodeTag: 2, values: [1, 0, 0, 0, 0, 0] } }]),
]
const elastic2: ModelWrite = { kind: 'element', entity: { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { A: 0.01, E: 2e11, Iz: 1e-4, transfTag: 1 } } }
const elastic3: ModelWrite = { kind: 'element', entity: { id: 1, eleType: 'ElasticBeamColumn', nodes: [1, 2], args: { A: 0.01, E: 2e11, G: 8e10, J: 1e-4, Iy: 1e-4, Iz: 1e-4, transfTag: 1 } } }
const fiber = (patch: Record<string, unknown> & { subType: string }, gJ?: number, intType = 'Legendre'): ModelWrite[] => [
  { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { matTag: 1, matType: 'Elastic', e: 2e11 } } },
  { kind: 'section', entity: { id: 1, secType: 'Fiber', args: { type: 'Fiber', secTag: 1, ...(gJ ? { gJ } : {}) }, children: [{ kind: 'patch', subType: patch.subType, args: { matTag: 1, ...patch } }] } },
  { kind: 'beamIntegration', entity: { id: 1, intType, args: { type: intType, tag: 1, secTag: 1, n: 3 } } },
]
const rect = { subType: 'rect', numSubdivY: 4, numSubdivZ: 2, y1: -0.1, z1: -0.1, y2: 0.1, z2: 0.1 }
const disp = (eleType = 'DispBeamColumn'): ModelWrite => ({ kind: 'element', entity: { id: 1, eleType, nodes: [1, 2], args: { transfTag: 1, integrationTag: 1 } } })

const CASES: [string, () => { ndm: 2 | 3; writes: ModelWrite[] }, RegExp][] = [
  ['3D Corotational', () => ({ ndm: 3, writes: frame3([elastic3], 'Corotational') }), /Corotational geomTransf is not supported in 3D/],
  ['joint offsets', () => ({ ndm: 2, writes: frame2([elastic2], 'Linear', { dI: [0, 0.2], dJ: [0, -0.2] }) }), /joint offsets \(-jntOffset\)/],
  ['2D fiber PDelta', () => ({ ndm: 2, writes: frame2([...fiber(rect), disp()], 'PDelta') }), /PDelta was treated as Linear/],
  ['3D fiber PDelta', () => ({ ndm: 3, writes: frame3([...fiber(rect, 1e6), disp()], 'PDelta') }), /3D fiber beam-columns only support Linear/],
  ['forceBeamColumn', () => ({ ndm: 2, writes: frame2([...fiber(rect), disp('forceBeamColumn')]) }), /forceBeamColumn\) is not yet supported/],
  ['3D zeroLengthSection', () => ({ ndm: 3, writes: frame3([...fiber(rect, 1e6), { kind: 'element', entity: { id: 1, eleType: 'zeroLengthSection', nodes: [1, 2], args: { secTag: 1 } } }]) }), /zeroLengthSection\) is not yet supported in 3D/],
  ['Radau integration', () => ({ ndm: 2, writes: frame2([...fiber(rect, undefined, 'Radau'), disp()]) }), /beamIntegration "Radau" not supported, defaulting to Legendre/],
  ['circular patch', () => ({ ndm: 2, writes: frame2([...fiber({ subType: 'circ', numSubdivCirc: 8, numSubdivRad: 2, yCenter: 0, zCenter: 0, intRad: 0, extRad: 0.2 }), disp()]) }), /fiber item "patch\/circ" is not yet supported/],
  ['imposed displacement (sp)', () => ({ ndm: 2, writes: [...frame2([elastic2]), { kind: 'patternChild', patternId: 1, child: { kind: 'sp', args: { nodeTag: 2, dof: 1, dofValue: 0.01 } } }] }), /imposed displacements \(sp\) are not supported/],
  ['unsupported material', () => ({ ndm: 2, writes: [...frame2([elastic2]), { kind: 'material', entity: { id: 5, kind: 'uniaxial', matType: 'Steel4', args: { matTag: 5, matType: 'Steel4' } } }] }), /Steel4\) is not yet supported/],
  ['MultipleSupport pattern', () => ({ ndm: 2, writes: [n(1, [0, 0]), n(2, [0, 3]), { kind: 'fix', entity: { nodeId: 1, dofs: [1, 2, 3] } }, { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1 } } }, elastic2, ...pattern([], 'MultipleSupport')] }), /MultipleSupport is not support/],
]

describe('unsupported input raises a diagnostic', () => {
  it.each(CASES)('%s', (_name, build, message) => {
    const { ndm, writes } = build()
    const { diagnostics } = compileInputV1(modelFromWrites(ndm, ndm === 2 ? 3 : 6, writes), history)
    expect(diagnostics.map((d) => d.message).join('\n')).toMatch(message)
  })
})
