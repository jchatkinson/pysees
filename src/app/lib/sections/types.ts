import type { FiberSectionItem } from '@/app/types/model'

export interface Point2 { y: number; z: number }
export interface SectionOutline { outer: Point2[]; holes: Point2[][] }

export type SectionTemplateKind = 'rect' | 'circle' | 'i' | 'c' | 'l' | 'tube'

export interface RebarLayoutParams { matId: number; barArea: number; cover: number }
export interface RectRebarParams extends RebarLayoutParams { nBarsY: number; nBarsZ: number }
export interface CircleRebarParams extends RebarLayoutParams { nBars: number }

export interface RectSectionParams {
  coreMatId: number
  width: number
  depth: number
  nSubdivY: number
  nSubdivZ: number
  rebar: RectRebarParams | null
}

export interface CircleSectionParams {
  coreMatId: number
  diameter: number
  nSubdivCirc: number
  nSubdivRad: number
  rebar: CircleRebarParams | null
}

export interface IShapeParams {
  matId: number
  depth: number
  flangeWidth: number
  flangeThick: number
  webThick: number
  nSubdiv: number
}

export interface CShapeParams {
  matId: number
  depth: number
  flangeWidth: number
  flangeThick: number
  webThick: number
  nSubdiv: number
}

export interface LShapeParams {
  matId: number
  legY: number
  legZ: number
  thickness: number
  nSubdiv: number
}

export interface TubeParams {
  matId: number
  diameter: number
  thickness: number
  nSubdivCirc: number
  nSubdivRad: number
}

/** A parametric shape generator: computes both the preview outline and the concrete OpenSeesPy fiber-section children from the same params. */
export interface SectionTemplateDef {
  kind: SectionTemplateKind
  label: string
  defaultParams: Record<string, unknown>
  outline(params: Record<string, unknown>): SectionOutline
  children(params: Record<string, unknown>): FiberSectionItem[]
}
