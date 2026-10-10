import type { FiberSectionItem } from '@/app/types/model'

export interface Point2 { y: number; z: number }
export interface SectionOutline { outer: Point2[]; holes: Point2[][] }

export type SectionTemplateKind = 'rect' | 'circle' | 'i' | 'c' | 'l' | 'tube' | 'hss' | 'concreteI' | 'concreteC' | 'concreteL'

export interface RebarLayoutParams { matId: number; barArea: number; cover: number }
export interface RectRebarParams extends RebarLayoutParams { nBarsY: number; nBarsZ: number }
export interface CircleRebarParams extends RebarLayoutParams { nBars: number }

export interface RectSectionParams {
  depthAxis?: 'y' | 'z'
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

export interface PlateMeshParams {
  nWebY: number; nWebZ: number; nFlangeY: number; nFlangeZ: number
  /** Legacy mesh count, retained for saved templates. */
  nSubdiv?: number
  depthAxis?: 'y' | 'z'
  rebar?: RectRebarParams | null
}

export interface IShapeParams extends PlateMeshParams {
  matId: number
  depth: number
  flangeWidth: number
  flangeThick: number
  webThick: number
}

export interface CShapeParams extends PlateMeshParams {
  matId: number
  depth: number
  flangeWidth: number
  flangeThick: number
  webThick: number
}

export interface LShapeParams extends PlateMeshParams {
  matId: number
  legY: number
  legZ: number
  thickness: number
}

export interface HssParams extends PlateMeshParams {
  matId: number; width: number; depth: number; thickness: number
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
  family: 'concrete' | 'steel'
  defaultParams: Record<string, unknown>
  outline(params: Record<string, unknown>): SectionOutline
  children(params: Record<string, unknown>): FiberSectionItem[]
}

export interface DistributedRebarParams extends RebarLayoutParams { spacing: number }
export interface EndRebarParams extends RebarLayoutParams { nBars: number; spacing: number; junctions?: boolean }
export interface ConcreteCShapeParams extends CShapeParams {
  webRebar: DistributedRebarParams | null
  flangeRebar: DistributedRebarParams | null
  endRebar: EndRebarParams | null
}

export interface WallRebarParams {
  webRebar: DistributedRebarParams | null
  flangeRebar: DistributedRebarParams | null
  endRebar: EndRebarParams | null
}
export interface ConcreteIShapeParams extends IShapeParams, WallRebarParams { wallShape: 'i' }
export interface ConcreteLShapeParams extends LShapeParams, WallRebarParams { wallShape: 'l'; webThick: number; flangeThick: number }
