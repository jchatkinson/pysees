import { describe, expect, it } from 'vitest'
import { getSchemaForFn } from '@/app/lib/commandSchemas'
import { decodeArgs, encodeArgs } from '@/app/lib/commands/grammar'
import { printScript } from '@/app/lib/commands/print'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import type { Tok } from '@/app/lib/commands/tokens'

/**
 * Each entry in scripts/schema-patches.json corrects what the OpenSeesPy docs can't express. These are real calls for the patched
 * commands (arguments in the order OpenSees takes them): each must read back through the schema exactly, and run in real OpenSees.
 */
interface Case { name: string; fn: string; ndm: 2 | 3; args: Tok[] }
const cases: Case[] = [
  { name: 'FixedLocation counts N sections and N locations', fn: 'beamIntegration', ndm: 2, args: ['FixedLocation', 1, 2, 1, 2, 0, 1] },
  { name: 'MidDistance', fn: 'beamIntegration', ndm: 2, args: ['MidDistance', 1, 2, 1, 2, 0.25, 0.75] },
  { name: 'LowOrder adds N weights', fn: 'beamIntegration', ndm: 2, args: ['LowOrder', 1, 2, 1, 2, 0, 1, 0.5, 0.5] },
  { name: 'UserDefined', fn: 'beamIntegration', ndm: 2, args: ['UserDefined', 1, 2, 1, 2, 0, 1, 0.5, 0.5] },
  { name: 'UserHinge counts each side separately', fn: 'beamIntegration', ndm: 2, args: ['UserHinge', 1, 1, 1, 2, 0.1, 0.5, 1, 3, 0.9, 0.5] },
  { name: 'Hysteretic takes (stress, strain) pairs', fn: 'uniaxialMaterial', ndm: 2, args: ['Hysteretic', 10, 10, 0.01, 12, 0.02, 14, 0.03, -10, -0.01, -12, -0.02, -14, -0.03, 1, 1, 0, 0] },
  { name: 'Steel4 params are 3 values', fn: 'uniaxialMaterial', ndm: 2, args: ['Steel4', 10, 400, 2e5, '-asym', '-kin', 0.01, 20, 0.925, 0.15, 0.01, 20, 0.925, 0.15] },
  { name: 'SteelMPF params are 3 values', fn: 'uniaxialMaterial', ndm: 2, args: ['SteelMPF', 10, 400, 400, 2e5, 0.01, 0.01, 20, 0.925, 0.15] },
  { name: '2D geomTransf with no offsets prints no flag', fn: 'geomTransf', ndm: 2, args: ['Linear', 5] },
  { name: '3D geomTransf: vecxz comes before -jntOffset', fn: 'geomTransf', ndm: 3, args: ['PDelta', 5, 0, 0, 1, '-jntOffset', 0.1, 0, 0, 0, 0.1, 0] },
  { name: '2D section Elastic: E A Iz', fn: 'section', ndm: 2, args: ['Elastic', 11, 2e11, 0.01, 1e-4] },
  { name: '2D section Elastic with shear: E A Iz G alphaY', fn: 'section', ndm: 2, args: ['Elastic', 12, 2e11, 0.01, 1e-4, 8e10, 1] },
  { name: '3D section Elastic: E A Iz Iy G J', fn: 'section', ndm: 3, args: ['Elastic', 11, 2e11, 0.01, 1e-4, 2e-4, 8e10, 3e-4] },
  { name: '3D section Elastic with shear areas', fn: 'section', ndm: 3, args: ['Elastic', 12, 2e11, 0.01, 1e-4, 2e-4, 8e10, 3e-4, 1, 1] },
  { name: 'Node recorder: respType ends the -dof list', fn: 'recorder', ndm: 2, args: ['Node', '-file', 'out/d.out', '-time', '-node', 1, 2, '-dof', 1, 2, 'disp'] },
]

describe('schema patches', () => {
  it.each(cases)('$name reads back exactly', ({ fn, ndm, args }) => {
    const schema = getSchemaForFn(fn, ndm)!
    const ctx = { ndm, ndf: ndm === 2 ? 3 : 6 }
    const { values, consumed, problems } = decodeArgs(schema.args, args, ctx)
    expect(problems).toEqual([])
    expect(consumed).toBe(args.length)
    expect(encodeArgs(schema.args, values, ctx)).toEqual(args)
  })

  describe.skipIf(!opensesAvailable)('and OpenSees accepts them', () => {
    it.each(cases)('$name', ({ fn, ndm, args }) => {
      const prelude = [
        { fn: 'model', args: ['basic', '-ndm', ndm, '-ndf', ndm === 2 ? 3 : 6] },
        { fn: 'node', args: ndm === 2 ? [1, 0, 0] : [1, 0, 0, 0] }, { fn: 'node', args: ndm === 2 ? [2, 1, 0] : [2, 1, 0, 0] },
        { fn: 'uniaxialMaterial', args: ['Elastic', 1, 1e6] },
        ...[1, 2, 3].map((n) => ({ fn: 'section', args: ndm === 3 ? ['Fiber', n, '-GJ', 1e6] : ['Fiber', n] })), // a 3D fiber section needs torsion
      ]
      const r = runOpenSees(printScript([...prelude, { fn, args }], 'py'))
      expect(r.failures, r.stderr).toEqual([])
      expect(r.ok).toBe(true)
    })
  })
})
