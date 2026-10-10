import { describe, expect, it } from 'vitest'
import { getAvailableSchemas, getSchemaForFn } from '@/app/lib/commandSchemas'
import { ELEMENTS, elementArgs } from '@/app/lib/commands/tables'
import type { ArgDef } from '@/app/types/schema'

const names = (args: ArgDef[]) => args.map((a) => (a.kind === 'flag' ? a.flag : a.name))
const yieldsOf = (fn: string, ndm: number, option: string) => (getSchemaForFn(fn, ndm)!.args[0] as Extract<ArgDef, { kind: 'choice' }>).yields[option]

describe('ndm-aware layouts', () => {
  it('section Elastic has the 2D layout in 2D and the 3D layout in 3D', () => {
    expect(names(yieldsOf('section', 2, 'Elastic'))).toEqual(['secTag', 'eMod', 'a', 'iz', 'gMod', 'alphaY'])
    expect(names(yieldsOf('section', 3, 'Elastic'))).toEqual(['secTag', 'eMod', 'a', 'iz', 'iy', 'gMod', 'jxx', 'alphaY', 'alphaZ'])
  })

  it('the shear modulus is optional in 2D and required in 3D', () => {
    const g = (ndm: number) => yieldsOf('section', ndm, 'Elastic').find((a) => a.kind !== 'flag' && a.name === 'gMod')!
    expect(g(2).required).toBe(false)
    expect(g(3).required).toBe(true)
  })

  it('no resolved schema still carries an ndm tag', () => {
    const tagged = (args: ArgDef[]): boolean => args.some((a) => 'ndm' in a || (a.kind === 'choice' && Object.values(a.yields).some(tagged)) || (a.kind === 'flag' && tagged(a.args)))
    for (const ndm of [2, 3]) expect(getAvailableSchemas(ndm).filter((s) => tagged(s.args) || tagged(s.optional)).map((s) => s.fn)).toEqual([])
  })

  it('keeps a schema\'s identity between calls (forms rely on it)', () => {
    expect(getAvailableSchemas(3)).toBe(getAvailableSchemas(3))
  })

  // The element form and the script import / export read two descriptions of the same layout; they must agree.
  describe.each([2, 3])('element form args match the element table in %iD', (ndm) => {
    const choice = getSchemaForFn('element', ndm)!.args[0] as Extract<ArgDef, { kind: 'choice' }>
    it.each(ELEMENTS)('$eleType', (spec) => {
      const form = names(choice.yields[spec.eleType]).filter((n) => n !== 'nodes' && !Object.entries(spec.flags ?? {}).some(([flag, f]) => n === flag || n === f.key))
      for (const arg of choice.yields[spec.eleType]) if (arg.kind === 'flag') {
        expect(spec.flags?.[arg.flag], `Missing codec flag ${arg.flag}`).toBeDefined()
        expect(names(arg.args)).toContain(spec.flags![arg.flag].key)
      }
      expect(form).toEqual(elementArgs(spec, ndm).filter((k) => !spec.flags || !Object.values(spec.flags).some((f) => f.key === k)))
    })
  })
})
