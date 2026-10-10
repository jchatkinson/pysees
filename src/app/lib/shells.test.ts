import { describe, expect, it } from 'vitest'
import { importScript } from '@/app/lib/scriptImport'
import { exportScript } from '@/app/lib/exportScript'
import { getAvailableSchemas, validateSchemaResult } from '@/app/lib/commandSchemas'
import { shellNodalAreas, shellFrame } from '@/app/lib/shells'
import { shellFixture, shellPressureFixture } from '@/app/lib/commands/testkit'
import type { Vec3 } from '@/app/lib/memberFrame'

const tilted = (xy: number[][]): Vec3[] => xy.map(([x, y]) => [x, y, 0.3 * x + 0.1 * y])

describe('shell geometry', () => {
  it('gives a quad area-weighted nodal shares that sum to its area, normal up for counter-clockwise nodes', () => {
    const xyz = tilted([[0, 0], [2, 0.2], [2.3, 1.7], [-0.1, 1.4]])
    const { normal, areas } = shellNodalAreas(xyz)!
    const d1 = [xyz[2][0] - xyz[0][0], xyz[2][1] - xyz[0][1], xyz[2][2] - xyz[0][2]], d2 = [xyz[3][0] - xyz[1][0], xyz[3][1] - xyz[1][1], xyz[3][2] - xyz[1][2]]
    const cross = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]]
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(0.5 * Math.hypot(...cross), 12)
    expect(normal[2]).toBeGreaterThan(0)
  })

  it('gives a triangle a third of its area per node', () => {
    const { areas } = shellNodalAreas([[0, 0, 0], [2, 0, 0], [0, 3, 0]])!
    expect(areas).toEqual([1, 1, 1])
  })

  it('returns null for degenerate shells', () => {
    expect(shellFrame([[0, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, 0]])).toBeNull()
  })
})

describe('shell script I/O', () => {
  it('reads shells and a self-weight back, with the sign OpenSees uses', () => {
    const { model, history } = shellFixture()
    const result = importScript(exportScript(model, history, 'py'), 'm.py')
    expect(result.model.elements.get(3)?.eleType).toBe('ShellDKGT')
    expect(result.model.elements.get(2)?.nodes).toEqual([2, 5, 6, 3])
    expect(result.model.patterns.get(1)?.children.at(-1)?.args).toMatchObject({ bz: -9.81 })
  })

  it('exports a pressure as nodal loads and warns when asked to read a shell pressure back', () => {
    const { model, history } = shellPressureFixture()
    const script = exportScript(model, history, 'py')
    expect(script).not.toMatch(/pressure'?\)/)
    expect(script).toContain('# shell pressure from elements 1, 2')
    const result = importScript(`${script}\nops.eleLoad('-ele', 1, '-type', '-shellPressure', 1.0)\n`, 'm.py')
    expect(result.diagnostics.some((d) => /pressure/i.test(d.message))).toBe(true)
  })
})

describe('shell form validation', () => {
  const { model } = shellFixture()
  const ctx = { ndm: 3 as const, ndf: 6 }
  const element = getAvailableSchemas(3).find((s) => s.fn === 'element')!
  const make = (eleType: string, nodes: number[], secTag = 1) => element.create({ eleType, nodes, secTag }, model)

  it('accepts a shell on existing nodes and a membrane-plate section', () => {
    expect(validateSchemaResult(make('ShellMITC4', [1, 2, 3, 4]), model, ctx)).toBeNull()
  })
  it('rejects a wrong node count, repeated nodes, a missing or wrong section, and 2D models', () => {
    expect(validateSchemaResult(make('ShellMITC4', [1, 2, 3]), model, ctx)).toMatch(/connects 4 nodes/)
    expect(validateSchemaResult(make('ShellMITC4', [1, 2, 2, 3]), model, ctx)).toMatch(/distinct/)
    expect(validateSchemaResult(make('ShellMITC4', [1, 2, 3, 4], 9), model, ctx)).toMatch(/Section does not exist/)
    expect(validateSchemaResult(make('ShellMITC4', [1, 2, 3, 4]), model, { ndm: 2, ndf: 3 })).toMatch(/3D/)
  })
  it('keeps shell loads on shells and beam loads off them', () => {
    const load = (cmd: Record<string, unknown>) => ({ target: 'model' as const, write: { kind: 'patternChild' as const, patternId: 1, child: { kind: 'eleLoad' as const, args: cmd } } })
    expect(validateSchemaResult(load({ eleTags: [1], loadType: 'Shell pressure', pressure: 1 }), model, ctx)).toBeNull()
    expect(validateSchemaResult(load({ eleTags: [1], wx: 0, wy: 1, wz: 0 }), model, ctx)).toMatch(/shell/)
    expect(validateSchemaResult(load({ eleTags: [99], pressure: 1 }), model, ctx)).toMatch(/does not exist/)
  })
})
