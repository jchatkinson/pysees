import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptyModel, type FiberSectionItem, type MaterialEntity } from '@/app/types/model'
import { emptyAnalysisHistory } from '@/app/types/analysisCommands'
import { exportScript } from '@/app/lib/exportScript'
import { importScript } from '@/app/lib/scriptImport'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { SECTION_TEMPLATE_LIST, SECTION_TEMPLATES, templateDefaults, normalizeTemplateParams, defaultMaterialId } from './templates'
import { aiscGeometry, aiscTemplateKind, type AiscSection, type SectionLengthUnit } from './aisc'
import { sectionGeometryError } from './validate'

const materials = new Map<number, MaterialEntity>([
  [7, { id: 7, kind: 'uniaxial', matType: 'Steel01', args: { matTag: 7, matType: 'Steel01', fy: 400e6, e0: 200e9, b: 0.01 } }],
  [9, { id: 9, kind: 'uniaxial', matType: 'Concrete01', args: { matTag: 9, matType: 'Concrete01', fpc: -30e6, epsc0: -0.002, fpcu: -6e6, epsU: -0.006 } }],
])
const area = (children: FiberSectionItem[]) => children.filter((c) => c.kind === 'patch').reduce((sum, { args: a }) => sum + (Number(a.y2) - Number(a.y1)) * (Number(a.z2) - Number(a.z1)), 0)

describe('fiber templates', () => {
  it.each(SECTION_TEMPLATE_LIST)('$kind selects defined materials and produces valid geometry', (tpl) => {
    const p = templateDefaults(tpl.kind, materials, 2)
    const children = tpl.children(p)
    expect(sectionGeometryError(children, p)).toBeNull()
    expect(children.every((c) => materials.has(Number(c.args.matTag)))).toBe(true)
    for (const c of children.filter((c) => c.subType === 'rect')) expect(c.args.numSubdivZ).toBe(1)
    const patches = children.filter((c) => c.kind === 'patch')
    expect(patches.every((c) => c.args.matTag === (tpl.family === 'concrete' ? 9 : 7))).toBe(true)
    expect(children.filter((c) => c.kind === 'fiber').every((c) => c.args.matTag === 7)).toBe(true)
  })

  it('uses generic uniaxial materials as fallback and excludes nD materials', () => {
    const m = new Map<number, MaterialEntity>([[1, { id: 1, kind: 'nD', matType: 'ElasticIsotropic', args: {} }], [3, { id: 3, kind: 'uniaxial', matType: 'Elastic', args: {} }]])
    expect(defaultMaterialId(m, 'steel')).toBe(3)
    expect(defaultMaterialId(new Map(), 'concrete')).toBe(0)
  })

  it('independently applies web and flange counts along local y and z', () => {
    const p = { ...templateDefaults('i', materials, 3), nWebY: 11, nWebZ: 3, nFlangeY: 2, nFlangeZ: 9 }
    const children = SECTION_TEMPLATES.i.children(p)
    expect(children.map((c) => [c.args.numSubdivY, c.args.numSubdivZ])).toEqual([[2, 9], [11, 3], [2, 9]])
    expect(area(children)).toBeCloseTo(2 * 0.15 * 0.012 + (0.3 - 2 * 0.012) * 0.008)
    expect(Math.max(...children.map((c) => Number(c.args.y2)))).toBe(0.15)
  })

  it('rectangular HSS has four nonoverlapping walls and the correct area', () => {
    const p = templateDefaults('hss', materials, 3)
    const children = SECTION_TEMPLATES.hss.children(p)
    expect(children).toHaveLength(4)
    expect(area(children)).toBeCloseTo(0.3 * 0.2 - 0.28 * 0.18)
    for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
      const a = children[i].args, b = children[j].args
      const dy = Math.max(0, Math.min(Number(a.y2), Number(b.y2)) - Math.max(Number(a.y1), Number(b.y1)))
      const dz = Math.max(0, Math.min(Number(a.z2), Number(b.z2)) - Math.max(Number(a.z1), Number(b.z1)))
      expect(dy * dz).toBe(0)
    }
  })

  it.each(['concreteI', 'concreteC', 'concreteL'] as const)('%s places distinct reinforcing bars inside its patches', (kind) => {
    const p = templateDefaults(kind, materials, 3), children = SECTION_TEMPLATES[kind].children(p)
    const bars = children.filter((c) => c.kind === 'fiber'), patches = children.filter((c) => c.kind === 'patch')
    expect(bars.length).toBeGreaterThan(0)
    expect(new Set(bars.map((c) => `${c.args.yloc},${c.args.zloc}`)).size).toBe(bars.length)
    for (const { args: b } of bars) expect(patches.some(({ args: a }) => Number(b.yloc) > Number(a.y1) && Number(b.yloc) < Number(a.y2) && Number(b.zloc) > Number(a.z1) && Number(b.zloc) < Number(a.z2))).toBe(true)
    const invalid = { ...p, webRebar: { ...(p.webRebar as object), cover: 0.2 } }
    expect(sectionGeometryError(SECTION_TEMPLATES[kind].children(invalid), invalid)).toMatch(/cover/i)
  })

  it('concrete C flanges span full width and its web spans the clear depth', () => {
    const p = templateDefaults('concreteC', materials, 3)
    expect(p).toMatchObject({ depth: 2.4384, flangeWidth: 0.9144, flangeThick: 0.2032, webThick: 0.2032 })
    const [web, top, bottom] = SECTION_TEMPLATES.concreteC.children(p)
    expect(web.args).toMatchObject({ y1: -1.016, y2: 1.016, z1: 0, z2: 0.2032 })
    expect(top.args).toMatchObject({ z1: 0, z2: 0.9144, y1: 1.016, y2: 1.2192 })
    expect(bottom.args).toMatchObject({ z1: 0, z2: 0.9144, y1: -1.2192, y2: -1.016 })
    expect(area([web, top, bottom])).toBeCloseTo(2 * 0.9144 * 0.2032 + 2.032 * 0.2032)
  })

  it('concrete C distributed reinforcement independently controls both wall faces', () => {
    const p = templateDefaults('concreteC', materials, 3)
    const webOnly = { ...p, flangeRebar: null }, flangeOnly = { ...p, webRebar: null }
    const webBars = SECTION_TEMPLATES.concreteC.children(webOnly).filter((c) => c.kind === 'fiber')
    const flangeBars = SECTION_TEMPLATES.concreteC.children(flangeOnly).filter((c) => c.kind === 'fiber')
    expect(webBars).toHaveLength(22)
    expect(flangeBars).toHaveLength(24)
    expect(new Set(webBars.map((c) => c.args.zloc))).toEqual(new Set([0.05, 0.1532]))
    expect(new Set(flangeBars.map((c) => Number(c.args.yloc).toFixed(4)))).toEqual(new Set(['-1.1692', '-1.0660', '1.0660', '1.1692']))
    const tighter = { ...webOnly, webRebar: { ...(p.webRebar as object), spacing: 0.1, barArea: 0.0003 } }
    const tighterBars = SECTION_TEMPLATES.concreteC.children(tighter).filter((c) => c.kind === 'fiber')
    expect(tighterBars.length).toBeGreaterThan(webBars.length)
    expect(tighterBars.every((c) => c.args.A === 0.0003)).toBe(true)
  })

  it('concrete C end groups replace distributed reinforcement in their flange regions', () => {
    const p = { ...templateDefaults('concreteC', materials, 3), endRebar: { matId: 7, cover: 0.05, barArea: 0.0005, nBars: 3, spacing: 0.075 } }
    const children = SECTION_TEMPLATES.concreteC.children(p), bars = children.filter((c) => c.kind === 'fiber')
    expect(sectionGeometryError(children, p)).toBeNull()
    expect(bars.filter((c) => c.args.A === 0.0005)).toHaveLength(12)
    expect(new Set(bars.map((c) => `${Number(c.args.yloc).toFixed(10)},${Number(c.args.zloc).toFixed(10)}`)).size).toBe(bars.length)
    const both = { ...p, endRebar: { ...p.endRebar, junctions: true } }
    expect(SECTION_TEMPLATES.concreteC.children(both).filter((c) => c.args.A === 0.0005)).toHaveLength(24)
    const invalid = { ...p, endRebar: { ...p.endRebar, nBars: 20 } }
    expect(sectionGeometryError(SECTION_TEMPLATES.concreteC.children(invalid), invalid)).toMatch(/fit/)
  })

  it('legacy concrete C reinforcement migrates without changing material or cover', () => {
    const legacy = { matId: 9, depth: 0.6, flangeWidth: 0.4, flangeThick: 0.12, webThick: 0.12, nSubdiv: 4, rebar: { matId: 7, cover: 0.04, barArea: 0.0003, nBarsY: 3, nBarsZ: 3 } }
    const p = normalizeTemplateParams('concreteC', legacy)
    expect(p.webRebar).toMatchObject({ matId: 7, cover: 0.04, barArea: 0.0003 })
    expect(p.flangeRebar).toMatchObject({ matId: 7, cover: 0.04, barArea: 0.0003 })
    expect(p.rebar).toBeUndefined()
    expect(p.depthAxis).toBeUndefined()
    expect(sectionGeometryError(SECTION_TEMPLATES.concreteC.children(p), p)).toBeNull()
  })

  it.each(['concreteI', 'concreteL'] as const)('%s uses wall-scale patches without overlaps', (kind) => {
    const p = templateDefaults(kind, materials, 3), patches = SECTION_TEMPLATES[kind].children(p).filter((c) => c.kind === 'patch')
    expect(p).toMatchObject({ webThick: 0.2032, flangeThick: 0.2032 })
    expect(area(patches)).toBeCloseTo(kind === 'concreteI' ? 2 * 0.9144 * 0.2032 + (2.4384 - 2 * 0.2032) * 0.2032 : 0.9144 * 0.2032 + (2.4384 - 0.2032) * 0.2032)
    for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
      const a = patches[i].args, b = patches[j].args
      const dy = Math.max(0, Math.min(Number(a.y2), Number(b.y2)) - Math.max(Number(a.y1), Number(b.y1)))
      const dz = Math.max(0, Math.min(Number(a.z2), Number(b.z2)) - Math.max(Number(a.z1), Number(b.z1)))
      expect(dy * dz).toBe(0)
    }
  })

  it.each(['concreteI', 'concreteL'] as const)('%s has independent distributed curtains and concentrated tips/junctions', (kind) => {
    const p = { ...templateDefaults(kind, materials, 3), endRebar: { matId: 7, cover: 0.05, barArea: 0.0005, nBars: 3, spacing: 0.075, junctions: true } }
    const children = SECTION_TEMPLATES[kind].children(p), bars = children.filter((c) => c.kind === 'fiber'), patches = children.filter((c) => c.kind === 'patch')
    expect(sectionGeometryError(children, p)).toBeNull()
    expect(bars.filter((c) => c.args.A === 0.0005)).toHaveLength(kind === 'concreteI' ? 36 : 24)
    expect(new Set(bars.map((c) => `${Number(c.args.yloc).toFixed(10)},${Number(c.args.zloc).toFixed(10)}`)).size).toBe(bars.length)
    for (const { args: b } of bars) expect(patches.some(({ args: a }) => Number(b.yloc) > Number(a.y1) && Number(b.yloc) < Number(a.y2) && Number(b.zloc) > Number(a.z1) && Number(b.zloc) < Number(a.z2))).toBe(true)
    const tipsOnly = { ...p, endRebar: { ...p.endRebar, junctions: false } }
    expect(SECTION_TEMPLATES[kind].children(tipsOnly).filter((c) => c.args.A === 0.0005)).toHaveLength(kind === 'concreteI' ? 24 : 12)
    const invalid = { ...p, endRebar: { ...p.endRebar, nBars: 50 } }
    expect(sectionGeometryError(SECTION_TEMPLATES[kind].children(invalid), invalid)).toMatch(/fit/)
    const noWeb = { ...p, endRebar: null, webRebar: null }
    const noFlanges = { ...p, endRebar: null, flangeRebar: null }
    expect(SECTION_TEMPLATES[kind].children(noWeb).filter((c) => c.kind === 'fiber').length).toBeGreaterThan(0)
    expect(SECTION_TEMPLATES[kind].children(noFlanges).filter((c) => c.kind === 'fiber').length).toBeGreaterThan(0)
  })

  it('concrete I reinforcement is symmetric about both local axes', () => {
    const p = { ...templateDefaults('concreteI', materials, 3), endRebar: { matId: 7, cover: 0.05, barArea: 0.0005, nBars: 3, spacing: 0.075, junctions: true } }
    const bars = SECTION_TEMPLATES.concreteI.children(p).filter((c) => c.kind === 'fiber')
    const key = (y: number, z: number) => `${Math.abs(y) < 1e-9 ? '0' : y.toFixed(9)},${Math.abs(z) < 1e-9 ? '0' : z.toFixed(9)}`
    const positions = new Set(bars.map((c) => key(Number(c.args.yloc), Number(c.args.zloc))))
    for (const { args: b } of bars) {
      expect(positions.has(key(-Number(b.yloc), Number(b.zloc)))).toBe(true)
      expect(positions.has(key(Number(b.yloc), -Number(b.zloc)))).toBe(true)
    }
  })

  it('concrete L supports independent leg thicknesses', () => {
    const p = { ...templateDefaults('concreteL', materials, 3), webThick: 0.3, flangeThick: 0.15 }
    const children = SECTION_TEMPLATES.concreteL.children(p)
    expect(sectionGeometryError(children, p)).toBeNull()
    expect(area(children)).toBeCloseTo(0.9144 * 0.15 + 0.3 * (2.4384 - 0.15))
  })

  it.each(['concreteI', 'concreteL'] as const)('%s migrates old reinforcement without resizing or rotating the section', (kind) => {
    const legacy = { matId: 9, depth: 0.6, flangeWidth: 0.4, flangeThick: 0.12, webThick: 0.12, legY: 0.4, legZ: 0.6, thickness: 0.12, nSubdiv: 4, rebar: { matId: 7, cover: 0.04, barArea: 0.0003, nBarsY: 3, nBarsZ: 3 } }
    const p = normalizeTemplateParams(kind, legacy)
    expect(p.depthAxis).toBeUndefined()
    expect(p).toMatchObject({ depth: 0.6, flangeWidth: 0.4, webThick: 0.12, flangeThick: 0.12 })
    expect(p.webRebar).toMatchObject({ matId: 7, cover: 0.04, barArea: 0.0003 })
    expect(p.flangeRebar).toMatchObject({ matId: 7, cover: 0.04, barArea: 0.0003 })
    expect(p.rebar).toBeUndefined()
    expect(sectionGeometryError(SECTION_TEMPLATES[kind].children(p), p)).toBeNull()
  })

  it('legacy templates retain their orientation and mesh when edited', () => {
    const legacy = { matId: 7, depth: 0.3, flangeWidth: 0.15, flangeThick: 0.012, webThick: 0.008, nSubdiv: 5 }
    const p = normalizeTemplateParams('i', legacy)
    expect(p.depthAxis).toBeUndefined()
    const children = SECTION_TEMPLATES.i.children(p)
    expect(children.map((c) => [c.args.numSubdivY, c.args.numSubdivZ])).toEqual([[5, 5], [5, 5], [5, 5]])
    expect(children[0].args).toMatchObject({ y1: -0.075, y2: 0.075, z2: 0.15 })
  })

  it('rejects impossible wall thickness', () => {
    for (const kind of ['hss', 'tube'] as const) {
      const p = { ...templateDefaults(kind, materials, 3), thickness: 1 }
      expect(sectionGeometryError(SECTION_TEMPLATES[kind].children(p), p)).not.toBeNull()
    }
  })
})

const catalog: AiscSection[] = JSON.parse(readFileSync('public/sections.v16.json', 'utf8'))
describe('AISC geometry', () => {
  it('maps every supported database entry to valid patches in all length units', () => {
    const supported = catalog.filter((s) => aiscTemplateKind(s))
    expect(supported.length).toBeGreaterThan(1000)
    for (const s of supported) for (const unit of ['m', 'mm', 'in', 'ft'] as SectionLengthUnit[]) {
      const kind = aiscTemplateKind(s)!, p = { ...templateDefaults(kind, materials, 3), ...aiscGeometry(s, unit) }
      expect(sectionGeometryError(SECTION_TEMPLATES[kind].children(p), p), `${s.Name} in ${unit}`).toBeNull()
    }
  })
  it('uses design HSS wall thickness and converts inches explicitly', () => {
    const s = catalog.find((s) => s.Type === 'HSS' && s.Ht)!
    expect(aiscGeometry(s, 'mm').thickness).toBeCloseTo(Number(s.tdes) * 25.4)
    const w = catalog.find((s) => s.Name === 'W44X408')!
    expect(aiscGeometry(w, 'm').depth).toBeCloseTo(44.8 * 0.0254)
  })
  it('does not treat tees or double angles as supported templates', () => {
    for (const type of ['WT', 'MT', 'ST', '2L']) expect(aiscTemplateKind(catalog.find((s) => s.Type === type)!)).toBeNull()
  })
})

for (const ndm of [2, 3] as const) describe(`${ndm}D fiber template export`, () => {
  for (const tpl of SECTION_TEMPLATE_LIST) {
    const model = emptyModel()
    model.config = { ndm, ndf: ndm === 2 ? 3 : 6 }
    model.materials = materials
    const p = templateDefaults(tpl.kind, materials, ndm)
    model.sections.set(1, { id: 1, secType: 'Fiber', args: { secTag: 1, type: 'Fiber', gJ: 1e6 }, children: tpl.children(p) })
    it(`${tpl.kind} round-trips its fibers in Python and Tcl`, () => {
      for (const lang of ['py', 'tcl'] as const) {
        const result = importScript(exportScript(model, emptyAnalysisHistory(), lang), `m.${lang}`)
        expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
        expect(result.model.sections.get(1)?.children).toEqual(model.sections.get(1)?.children)
      }
    })
    it.skipIf(!opensesAvailable)(`${tpl.kind} is accepted by real OpenSeesPy`, () => {
      const result = runOpenSees(exportScript(model, emptyAnalysisHistory(), 'py'))
      expect(result.ok, result.stderr).toBe(true)
    })
  }
})

for (const ndm of [2, 3] as const) describe(`${ndm}D wall reinforcement exports`, () => {
  it.each(['concreteI', 'concreteL'] as const)('%s with concentrated junction and tip bars exports correctly', (kind) => {
    const model = emptyModel()
    model.config = { ndm, ndf: ndm === 2 ? 3 : 6 }
    model.materials = materials
    const p = { ...templateDefaults(kind, materials, ndm), endRebar: { matId: 7, cover: 0.05, barArea: 0.0005, nBars: 3, spacing: 0.075, junctions: true } }
    const children = SECTION_TEMPLATES[kind].children(p)
    model.sections.set(1, { id: 1, secType: 'Fiber', args: { secTag: 1, type: 'Fiber', gJ: 1e6 }, children })
    for (const lang of ['py', 'tcl'] as const) {
      const result = importScript(exportScript(model, emptyAnalysisHistory(), lang), `m.${lang}`)
      expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
      expect(result.model.sections.get(1)?.children).toEqual(children)
    }
    if (opensesAvailable) {
      const result = runOpenSees(exportScript(model, emptyAnalysisHistory(), 'py'))
      expect(result.ok, result.stderr).toBe(true)
    }
  })
})
