import type { FiberSectionItem } from '@/app/types/model'
import type { SectionOutline, SectionTemplateDef, SectionTemplateKind } from '@/app/lib/sections/types'
import { defaultRectParams, rectChildren, rectOutline } from '@/app/lib/sections/templates/rect'
import { defaultCircleParams, circleChildren, circleOutline } from '@/app/lib/sections/templates/circle'
import { defaultIShapeParams, iShapeChildren, iShapeOutline } from '@/app/lib/sections/templates/iShape'
import { defaultCShapeParams, cShapeChildren, cShapeOutline } from '@/app/lib/sections/templates/cShape'
import { defaultLShapeParams, lShapeChildren, lShapeOutline } from '@/app/lib/sections/templates/lShape'
import { defaultTubeParams, tubeChildren, tubeOutline } from '@/app/lib/sections/templates/tube'

function def<P>(kind: SectionTemplateKind, label: string, defaultParams: P, outline: (p: P) => SectionOutline, children: (p: P) => FiberSectionItem[]): SectionTemplateDef {
  return {
    kind,
    label,
    defaultParams: defaultParams as Record<string, unknown>,
    outline: (p) => outline(p as P),
    children: (p) => children(p as P),
  }
}

export const SECTION_TEMPLATES: Record<SectionTemplateKind, SectionTemplateDef> = {
  rect: def('rect', 'Rectangle', defaultRectParams, rectOutline, rectChildren),
  circle: def('circle', 'Circle', defaultCircleParams, circleOutline, circleChildren),
  i: def('i', 'I-Shape', defaultIShapeParams, iShapeOutline, iShapeChildren),
  c: def('c', 'C-Shape', defaultCShapeParams, cShapeOutline, cShapeChildren),
  l: def('l', 'L-Shape', defaultLShapeParams, lShapeOutline, lShapeChildren),
  tube: def('tube', 'Tube', defaultTubeParams, tubeOutline, tubeChildren),
}

export const SECTION_TEMPLATE_LIST = Object.values(SECTION_TEMPLATES)
