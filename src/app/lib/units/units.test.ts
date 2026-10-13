import { describe, expect, it } from 'vitest'
import { GENERATED_COMMAND_SCHEMAS } from '@/app/generated/commandSchemas.generated'
import { getAvailableSchemas, getPatternChildSchemas } from '@/app/lib/commandSchemas'
import type { ArgDef } from '@/app/types/schema'
import { QTY_RULES, resolveQty } from '@/app/lib/units/quantities'
import { CATEGORY_IDS, derivedUnit, makeUnitContext, parseBaseUnits, parseUnitPrefs, unitOptions, UNIT_PRESETS, formatQuantity } from '@/app/lib/units/units'

const kipIn = makeUnitContext({ length: 'in', force: 'kip', time: 's' })
const newtonMm = makeUnitContext({ length: 'mm', force: 'N', time: 's' })

describe('derived units', () => {
  it('names the natural stress unit of each system', () => {
    expect(kipIn.symbol('stress')).toBe('ksi')
    expect(newtonMm.symbol('stress')).toBe('MPa')
    expect(makeUnitContext({ length: 'm', force: 'kN', time: 's' }).symbol('stress')).toBe('kPa')
    expect(makeUnitContext({ length: 'm', force: 'N', time: 's' }).symbol('stress')).toBe('Pa')
  })
  it('spells out mass, which has no name in kip-in-s, and names it where it does', () => {
    expect(kipIn.symbol('mass')).toBe('kip·s²/in')
    expect(newtonMm.symbol('mass')).toBe('t') // N·s²/mm is a tonne
    expect(makeUnitContext({ length: 'm', force: 'N', time: 's' }).symbol('mass')).toBe('kg')
    expect(kipIn.symbol('inertia')).toBe('in⁴')
    expect(kipIn.symbol('moment')).toBe('kip·in')
    expect(kipIn.symbol('forcePerLength')).toBe('kip/in')
  })
  it('every category has a unit in every preset, and offers its own derived unit', () => {
    for (const p of UNIT_PRESETS) for (const cat of CATEGORY_IDS) {
      const d = derivedUnit(cat, p.units.length, p.units.force, p.units.time)
      expect(d.sym).not.toBe('')
      expect(unitOptions(cat).some((o) => Math.abs(o.si / d.si - 1) < 1e-9), `${p.id} ${cat} ${d.sym}`).toBe(true)
    }
  })
})

describe('conversion', () => {
  it('is the identity in the base system', () => {
    for (const cat of CATEGORY_IDS) expect(kipIn.toDisplay(cat, 12.5)).toBeCloseTo(12.5, 12)
  })
  it('converts a length and its powers', () => {
    const c = makeUnitContext({ length: 'in', force: 'kip', time: 's' }, { length: 'ft' })
    expect(c.toDisplay('length', 24)).toBeCloseTo(2, 12)
    expect(c.toDisplay('area', 144)).toBeCloseTo(1, 12) // auto-follows length: ft²
    expect(c.symbol('inertia')).toBe('ft⁴')
    expect(c.fromDisplay('length', 2)).toBeCloseTo(24, 12)
  })
  it('converts stress between systems: 29000 ksi is about 200 GPa', () => {
    const c = makeUnitContext({ length: 'in', force: 'kip', time: 's' }, { stress: 'GPa' })
    expect(c.toDisplay('stress', 29000)).toBeCloseTo(199.9, 0)
  })
  it('round-trips display and base without drift', () => {
    const c = makeUnitContext({ length: 'mm', force: 'N', time: 's' }, { length: 'm', stress: 'GPa' })
    for (const v of [0, 1, 0.3, 123456.789, 2e5]) expect(c.fromDisplay('stress', c.toDisplay('stress', v))).toBeCloseTo(v, 9)
    expect(formatQuantity(c.toDisplay('length', 300))).toBe('0.3')
  })
  it('an unitless model converts and labels nothing', () => {
    const c = makeUnitContext(undefined)
    expect(c.active).toBe(false)
    expect(c.symbol('stress')).toBe('')
    expect(c.toDisplay('stress', 5)).toBe(5)
    expect(c.parse('stress', '12 ksi')).toBeNull()
    expect(c.parse('stress', '12')).toBe(12)
  })
})

describe('typed quantities', () => {
  it('reads a bare number in the display unit and a suffixed one in its own', () => {
    expect(kipIn.parse('length', '48')).toBe(48)
    expect(kipIn.parse('length', '4 ft')).toBeCloseTo(48, 10)
    expect(kipIn.parse('length', '4ft')).toBeCloseTo(48, 10)
    expect(kipIn.parse('stress', '200 GPa')).toBeCloseTo(200e9 / (4448.2216152605 / 0.0254 ** 2), 6)
    expect(kipIn.parse('inertia', '2 ft^4')).toBeCloseTo(2 * 12 ** 4, 6)
    expect(kipIn.parse('moment', '1 kip*ft')).toBeCloseTo(12, 10)
  })
  it('rejects a unit of another dimension, or none it knows', () => {
    expect(kipIn.parse('length', '4 kip')).toBeNull()
    expect(kipIn.parse('length', '4 furlongs')).toBeNull()
    expect(kipIn.parse('length', '')).toBeNull()
    expect(kipIn.parse('length', '-')).toBeNull()
  })
})

describe('saved forms', () => {
  it('validates base units and drops unknown display choices', () => {
    expect(parseBaseUnits(undefined)).toBeUndefined()
    expect(parseBaseUnits({ length: 'in', force: 'kip', time: 's' })).toEqual({ length: 'in', force: 'kip', time: 's' })
    expect(parseBaseUnits({ length: 'furlong', force: 'kip', time: 's' })).toBeNull()
    expect(parseUnitPrefs({ stress: 'MPa', length: 'parsec', bogus: 'x', force: 3 })).toEqual({ stress: 'MPa' })
  })
})

describe('quantity tags', () => {
  it('resolves per-DOF vecs and material roles by context', () => {
    expect(resolveQty('dofForce', { ndm: 3 }, 2)).toBe('force')
    expect(resolveQty('dofForce', { ndm: 3 }, 3)).toBe('moment')
    expect(resolveQty('dofForce', { ndm: 2 }, 2)).toBe('moment')
    expect(resolveQty('dofMass', { ndm: 2 }, 2)).toBe('massInertia')
    expect(resolveQty('dofValue', { ndm: 2, dof: 2 })).toBe('length')
    expect(resolveQty('dofValue', { ndm: 2, dof: 3 })).toBeNull()
    expect(resolveQty('mModulus', { ndm: 2 })).toBe('stress')
    expect(resolveQty('mModulus', { ndm: 2, usage: 'force-deformation' })).toBe('forcePerLength')
    expect(resolveQty('mStrain', { ndm: 2 })).toBeNull()
    expect(resolveQty('mStrain', { ndm: 2, usage: 'force-deformation' })).toBe('length')
    expect(resolveQty(['mStrain', 'mStress'], { ndm: 2 }, 3)).toBe('stress')
  })

  const find = (args: ArgDef[], path: string[]): ArgDef[] | null => {
    // The args under a path like uniaxialMaterial/Steel01: the choice option's yields.
    if (path.length === 0) return args
    for (const a of args) {
      if (a.kind === 'choice' && a.yields[path[0]]) return find(a.yields[path[0]], path.slice(1))
      if (a.kind === 'flag') { const r = find(a.args, path); if (r) return r }
    }
    return null
  }
  const names = (args: ArgDef[]): string[] => args.flatMap((a) => (a.kind === 'choice' ? [a.name, ...Object.values(a.yields).flatMap(names)] : a.kind === 'flag' ? names(a.args) : [a.name]))

  it('every rule names an arg that exists, so a schema rename cannot silently drop a unit', () => {
    const all = [...getAvailableSchemas(3), ...getAvailableSchemas(2), ...getPatternChildSchemas()]
    for (const [path, rules] of Object.entries(QTY_RULES)) {
      const [fn, option] = path.split('/')
      const schemas = all.filter((s) => s.fn === fn)
      expect(schemas.length, `no command ${fn}`).toBeGreaterThan(0)
      for (const name of Object.keys(rules)) {
        const found = schemas.some((s) => {
          const args = [...s.args, ...s.optional]
          const scope = option ? find(args, [option]) : args
          return scope ? names(scope).includes(name) : false
        })
        expect(found, `${path} has no arg "${name}"`).toBe(true)
      }
    }
  })

  it('tags land on the schemas the forms use', () => {
    const el = getAvailableSchemas(3).find((s) => s.fn === 'element')!
    const eleType = el.args[0] as Extract<ArgDef, { kind: 'choice' }>
    const E = eleType.yields.ElasticBeamColumn.find((a) => a.kind === 'float' && a.name === 'E')
    expect(E && 'qty' in E ? E.qty : undefined).toBe('stress')
    const load = getPatternChildSchemas().find((s) => s.fn === 'load')!
    expect((load.args[1] as { qty?: unknown }).qty).toBe('dofForce')
    expect(GENERATED_COMMAND_SCHEMAS.length).toBeGreaterThan(0)
  })
})

describe('material usage', () => {
  it('keeps spring materials out of trusses and fibers', async () => {
    const { validateSchemaResult } = await import('@/app/lib/commandSchemas')
    const { modelFromWrites } = await import('@/app/lib/commands/testkit')
    const model = modelFromWrites(2, 3, [
      { kind: 'node', entity: { id: 1, coords: [0, 0] } }, { kind: 'node', entity: { id: 2, coords: [1, 0] } },
      { kind: 'material', entity: { id: 1, kind: 'uniaxial', matType: 'Elastic', args: { e: 100 } } },
      { kind: 'material', entity: { id: 2, kind: 'uniaxial', matType: 'Elastic', args: { e: 100 }, usage: 'force-deformation' } },
    ])
    const truss = (matTag: number) => ({ target: 'model' as const, write: { kind: 'element' as const, entity: { id: 1, eleType: 'Truss', nodes: [1, 2], args: { A: 1, matTag } } } })
    expect(validateSchemaResult(truss(1), model, { ndm: 2, ndf: 3 })).toBeNull()
    expect(validateSchemaResult(truss(2), model, { ndm: 2, ndf: 3 })).toMatch(/force-deformation/)
  })
})
