import { describe, expect, it } from 'vitest'
import { emptyModel, type Model } from '@/app/types/model'
import { memberShape, shellThickness } from './memberShape'

const model = (): Model => {
  const m: Model = { ...emptyModel(), config: { ndm: 3, ndf: 6 } }
  m.sections.set(1, { id: 1, secType: 'Fiber', args: {}, children: [{ kind: 'patch', subType: 'rect', args: { matTag: 1, numSubdivY: 4, numSubdivZ: 4, y1: -0.2, z1: -0.1, y2: 0.2, z2: 0.1 } }] })
  m.sections.set(2, { id: 2, secType: 'Elastic', args: { a: 0.04 }, children: [] })
  m.sections.set(3, { id: 3, secType: 'ElasticMembranePlateSection', args: { h: 0.2 }, children: [] })
  m.beamIntegrations.set(1, { id: 1, intType: 'Lobatto', args: { secTag: 1 } })
  m.beamIntegrations.set(2, { id: 2, intType: 'Lobatto', args: { secTag: 2 } })
  return m
}
const ele = (eleType: string, args: Record<string, unknown>, nodes = [1, 2]) => ({ id: 1, eleType, nodes, args })

describe('memberShape', () => {
  it('a fiber member takes its section outline (patch bounding box without template data)', () => {
    const s = memberShape(model(), ele('DispBeamColumn', { integrationTag: 1 }))!
    expect(s.nominal).toBe(false)
    expect(s.outline.outer).toEqual([{ y: -0.2, z: -0.1 }, { y: 0.2, z: -0.1 }, { y: 0.2, z: 0.1 }, { y: -0.2, z: 0.1 }])
  })
  it('an elastic member with second moments is its equivalent rectangle (depth along local z from Iy)', () => {
    const b = 190, d = 286, s = memberShape(model(), ele('ElasticBeamColumn', { A: b * d, Iy: b * d ** 3 / 12, Iz: d * b ** 3 / 12 }))!
    expect(s.nominal).toBe(true)
    expect(s.outline.outer[2].y).toBeCloseTo(b / 2, 6)
    expect(s.outline.outer[2].z).toBeCloseTo(d / 2, 6)
  })
  it('elastic members without second moments, elastic sections and trusses are nominal squares of their area', () => {
    const side = (s: ReturnType<typeof memberShape>) => s!.outline.outer[1].y - s!.outline.outer[0].y
    expect(side(memberShape(model(), ele('ElasticBeamColumn', { A: 0.09 })))).toBeCloseTo(0.3)
    expect(side(memberShape(model(), ele('DispBeamColumn', { integrationTag: 2 })))).toBeCloseTo(0.2)
    expect(memberShape(model(), ele('Truss', { A: 0.01 }))!.nominal).toBe(true)
  })
  it('springs and shells have no swept shape; shells have a thickness', () => {
    expect(memberShape(model(), ele('zeroLength', {}))).toBeNull()
    expect(shellThickness(model(), ele('ShellMITC4', { secTag: 3 }, [1, 2, 3, 4]))).toBe(0.2)
  })
})
