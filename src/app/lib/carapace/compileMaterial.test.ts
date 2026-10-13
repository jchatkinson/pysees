import { describe, expect, it } from 'vitest'
import type { MaterialEntity } from '@/app/types/model'
import type { CompileDiagnostic } from '@/app/lib/compileAnalysisSequence'
import { compileMaterial, compileMaterialWithDependencies } from '@/app/lib/carapace/compileInputV1'

const mat = (id: number, matType: string, args: Record<string, unknown>): MaterialEntity => ({ id, kind: 'uniaxial', matType, args })
const compile = (m: MaterialEntity, ref?: Parameters<typeof compileMaterial>[2]) => { const d: CompileDiagnostic[] = []; return { spec: compileMaterial(m, d, ref), errors: d.filter((x) => x.severity === 'error').map((x) => x.message) } }

describe('compileMaterial', () => {
  it('renames Concrete02 args to the wire names', () => {
    expect(compile(mat(1, 'Concrete02', { fpc: -30, epsc0: -0.002, fpcu: -20, epsU: -0.006, lambda: 0.1, ft: 3, ets: 200 })).spec).toEqual({ kind: 'concrete02', fc: -30, epsc0: -0.002, fcu: -20, epscu: -0.006, rat: 0.1, ft: 3, ets: 200 })
  })
  it('splits Hysteretic pairs, defaulting p3/n3 to p2/n2', () => {
    const { spec } = compile(mat(1, 'Hysteretic', { p1: [1, 0.1], p2: [2, 0.2], n1: [-1, -0.1], n2: [-2, -0.2], pinchX: 1, pinchY: 1, damage1: 0, damage2: 0 }))
    expect(spec).toMatchObject({ kind: 'hysteretic', mom3p: 2, rot3p: 0.2, mom3n: -2, rot3n: -0.2, beta: 0 })
  })
  it('rejects a Pinching4 damage type other than cycle/energy', () => {
    expect(compile(mat(1, 'Pinching4', { dmgType: 'foo' })).errors[0]).toMatch(/dmgType/)
    expect(compile(mat(1, 'Pinching4', { dmgType: "'cycle'" })).spec).toMatchObject({ dmgCyc: 'cycleBased' })
  })
  it('no longer drops ElasticPP / Steel02 options silently', () => {
    expect(compile(mat(1, 'ElasticPP', { e: 1, epsyP: 0.1, epsyN: 0.2 })).errors).toHaveLength(1)
    expect(compile(mat(1, 'ElasticPP', { e: 1, epsyP: 0.1, epsyN: 0.1, eps0: 0 })).errors).toEqual([])
    expect(compile(mat(1, 'Steel02', { fy: 1, e0: 1, b: 0.01, sigInit: 5 })).errors).toHaveLength(1)
  })
  it('maps composites through the reference resolver and checks factor counts', () => {
    const ref = (tag: number) => tag - 1
    expect(compile(mat(9, 'Parallel', { matTags: [1, 2], factorArgs: [1, 0.5] }), ref).spec).toEqual({ kind: 'parallel', children: [[0, 1], [1, 0.5]] })
    expect(compile(mat(9, 'Parallel', { matTags: [1, 2] }), ref).spec).toEqual({ kind: 'parallel', children: [[0, 1], [1, 1]] })
    expect(compile(mat(9, 'Parallel', { matTags: [1, 2], factorArgs: [1] }), ref).errors).toHaveLength(1)
    expect(compile(mat(9, 'Series', { matTags: [3, 1] }), ref).spec).toEqual({ kind: 'series', children: [2, 0] })
    expect(compile(mat(9, 'MinMax', { otherTag: 2, minStrain: -0.01 }), ref).spec).toEqual({ kind: 'minMax', inner: 1, minStrain: -0.01, maxStrain: 1e16 })
  })
  it('still reports Gap as unsupported (OpenSees has no matching material)', () => {
    expect(compile(mat(1, 'Gap', {})).errors[0]).toMatch(/not yet supported/)
  })
})

describe('compileMaterialWithDependencies', () => {
  const lookup = (...ms: MaterialEntity[]) => new Map(ms.map((m) => [m.id, m]))
  it('builds an arena of the transitive dependencies', () => {
    const base = mat(1, 'Elastic', { e: 10 })
    const wrapped = mat(2, 'MinMax', { otherTag: 1, minStrain: -1, maxStrain: 1 })
    const d: CompileDiagnostic[] = []
    const { material, arena } = compileMaterialWithDependencies(mat(3, 'Series', { matTags: [2, 1] }), lookup(base, wrapped), d)
    expect(d).toEqual([])
    expect(arena).toEqual([{ kind: 'elastic', e: 10 }, { kind: 'minMax', inner: 0, minStrain: -1, maxStrain: 1 }])
    expect(material).toEqual({ kind: 'series', children: [1, 0] })
  })
  it('reports unknown tags and cycles', () => {
    const a = mat(1, 'Series', { matTags: [2] }), b = mat(2, 'Series', { matTags: [1] })
    const d: CompileDiagnostic[] = []
    compileMaterialWithDependencies(a, lookup(a, b), d)
    expect(d.some((x) => /circular/.test(x.message))).toBe(true)
    const d2: CompileDiagnostic[] = []
    compileMaterialWithDependencies(mat(5, 'Series', { matTags: [99] }), lookup(), d2)
    expect(d2[0].message).toMatch(/unknown material 99/)
  })
})
