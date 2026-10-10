import type { FiberSectionItem } from '@/app/types/model'
import type { CShapeParams, SectionOutline } from '@/app/lib/sections/types'
import { platePatch } from '@/app/lib/sections/plateMesh'

// Channel: web along y=0..webThick (full height), flanges extend from the web to y=flangeWidth, opening toward +y.
export const defaultCShapeParams: CShapeParams = {
  matId: 0, depth: 0.3, flangeWidth: 0.1, flangeThick: 0.012, webThick: 0.008, depthAxis: 'y', nWebY: 12, nWebZ: 2, nFlangeY: 2, nFlangeZ: 8,
}

export function cShapeOutline(p: CShapeParams): SectionOutline {
  const d = p.depth / 2
  const tw = p.webThick
  const bf = p.flangeWidth
  const fz = d - p.flangeThick
  const outline: SectionOutline = {
    outer: [
      { y: 0, z: d }, { y: bf, z: d }, { y: bf, z: fz }, { y: tw, z: fz },
      { y: tw, z: -fz }, { y: bf, z: -fz }, { y: bf, z: -d }, { y: 0, z: -d },
    ],
    holes: [],
  }
  return p.depthAxis === 'y' ? { outer: outline.outer.map(({ y, z }) => ({ y: z, z: y })), holes: [] } : outline
}

export function cShapeChildren(p: CShapeParams): FiberSectionItem[] {
  const d = p.depth / 2
  const tw = p.webThick
  const bf = p.flangeWidth
  const fz = d - p.flangeThick
  return [
    platePatch(p, 0, -d, tw, d, 'web'),
    platePatch(p, tw, fz, bf, d, 'flange'),
    platePatch(p, tw, -d, bf, -fz, 'flange'),
  ]
}
