import type { FiberSectionItem, MaterialEntity } from '@/app/types/model'
import type { SectionOutline, SectionTemplateDef, SectionTemplateKind } from '@/app/lib/sections/types'
import { defaultRectParams, rectChildren, rectOutline } from '@/app/lib/sections/templates/rect'
import { defaultCircleParams, circleChildren, circleOutline } from '@/app/lib/sections/templates/circle'
import { defaultIShapeParams, iShapeChildren, iShapeOutline } from '@/app/lib/sections/templates/iShape'
import { defaultCShapeParams, cShapeChildren, cShapeOutline } from '@/app/lib/sections/templates/cShape'
import { defaultLShapeParams, lShapeChildren, lShapeOutline } from '@/app/lib/sections/templates/lShape'
import { defaultConcreteCParams, concreteCChildren } from './concreteC'
import { defaultConcreteIParams, defaultConcreteLParams, concreteWallChildren, concreteLOutline } from './concreteWalls'
import { defaultHssParams, hssChildren, hssOutline } from './hss'
import { defaultTubeParams, tubeChildren, tubeOutline } from '@/app/lib/sections/templates/tube'

function def<P>(kind: SectionTemplateKind, label: string, defaultParams: P, outline: (p: P) => SectionOutline, children: (p: P) => FiberSectionItem[], family: 'concrete' | 'steel' = 'steel'): SectionTemplateDef {
  return {
    kind,
    label, family,
    defaultParams: defaultParams as Record<string, unknown>,
    outline: (p) => outline(p as P),
    children: (p) => children(p as P),
  }
}

export const SECTION_TEMPLATES: Record<SectionTemplateKind, SectionTemplateDef> = {
  rect: def('rect', 'Rectangle', defaultRectParams, rectOutline, rectChildren, 'concrete'),
  circle: def('circle', 'Circle', defaultCircleParams, circleOutline, circleChildren, 'concrete'),
  i: def('i', 'I-Shape', defaultIShapeParams, iShapeOutline, iShapeChildren),
  c: def('c', 'C-Shape', defaultCShapeParams, cShapeOutline, cShapeChildren),
  l: def('l', 'L-Shape', defaultLShapeParams, lShapeOutline, lShapeChildren),
  concreteI: def('concreteI', 'I-Shape', defaultConcreteIParams, iShapeOutline, concreteWallChildren, 'concrete'),
  concreteC: def('concreteC', 'C-Shape', defaultConcreteCParams, cShapeOutline, concreteCChildren, 'concrete'),
  concreteL: def('concreteL', 'L-Shape', defaultConcreteLParams, concreteLOutline, concreteWallChildren, 'concrete'),
  hss: def('hss', 'Rect. HSS', defaultHssParams, hssOutline, hssChildren),
  tube: def('tube', 'Round tube', defaultTubeParams, tubeOutline, tubeChildren),
}

export const SECTION_TEMPLATE_LIST = Object.values(SECTION_TEMPLATES)

/** Choose a material of the intended family; generic uniaxial materials are a useful fallback. */
export function defaultMaterialId(materials: Map<number, MaterialEntity>, family: 'concrete' | 'steel'): number {
  const all = [...materials.values()].filter((m) => m.kind === 'uniaxial').sort((a, b) => a.id - b.id)
  const preferred = all.find((m) => family === 'concrete' ? /Concrete/i.test(m.matType) : /Steel|Reinforcing/i.test(m.matType))
  return preferred?.id ?? all.find((m) => !/Concrete|Steel|Reinforcing/i.test(m.matType))?.id ?? 0
}

export function templateDefaults(kind: SectionTemplateKind, materials: Map<number, MaterialEntity>, ndm: 2 | 3): Record<string, unknown> {
  const tpl = SECTION_TEMPLATES[kind]
  const p = { ...tpl.defaultParams }
  const matId = defaultMaterialId(materials, tpl.family)
  if ('coreMatId' in p) p.coreMatId = matId
  if ('matId' in p) p.matId = matId
  for (const key of ['rebar', 'webRebar', 'flangeRebar', 'endRebar']) if (p[key]) p[key] = { ...(p[key] as Record<string, unknown>), matId: defaultMaterialId(materials, 'steel') }
  if (ndm === 2) for (const key of ['nSubdivZ', 'nWebZ', 'nFlangeZ']) if (key in p) p[key] = 1
  return p
}

/** Migrate older controls while retaining saved dimensions, orientation, and material references. */
export function normalizeTemplateParams(kind: SectionTemplateKind, params: Record<string, unknown>): Record<string, unknown> {
  const defaults = SECTION_TEMPLATES[kind].defaultParams
  const p = { ...defaults, ...params }
  if (!('depthAxis' in params)) delete p.depthAxis
  for (const key of ['nWebY', 'nWebZ', 'nFlangeY', 'nFlangeZ']) if (key in defaults && !(key in params)) p[key] = params.nSubdiv ?? defaults[key]
  if (kind === 'concreteL') { p.webThick = params.webThick ?? params.thickness; p.flangeThick = params.flangeThick ?? params.thickness }
  if (['concreteC', 'concreteI', 'concreteL'].includes(kind) && !('webRebar' in params)) {
    const old = params.rebar as Record<string, unknown> | null
    p.webRebar = old ? { ...old, spacing: Math.max(0.001, ((kind === 'concreteL' ? Number(params.legZ) - Number(p.flangeThick) : Number(params.depth) - 2 * Number(params.flangeThick)) - 2 * Number(old.cover)) / Math.max(1, Number(old[params.depthAxis === 'y' ? 'nBarsY' : 'nBarsZ']) - 1)) } : null
    p.flangeRebar = old ? { ...old, spacing: Math.max(0.001, (Number(kind === 'concreteL' ? params.legY : params.flangeWidth) - 2 * Number(old.cover)) / Math.max(1, Number(old[params.depthAxis === 'y' ? 'nBarsZ' : 'nBarsY']) - 1)) } : null
    delete p.rebar
  }
  return p
}
