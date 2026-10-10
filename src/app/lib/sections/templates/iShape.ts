import type { FiberSectionItem } from '@/app/types/model'
import type { IShapeParams, SectionOutline } from '@/app/lib/sections/types'
import { platePatch } from '@/app/lib/sections/plateMesh'

export const defaultIShapeParams: IShapeParams = {
  matId: 0, depth: 0.3, flangeWidth: 0.15, flangeThick: 0.012, webThick: 0.008, depthAxis: 'y', nWebY: 12, nWebZ: 2, nFlangeY: 2, nFlangeZ: 8,
}

export function iShapeOutline(p: IShapeParams): SectionOutline {
  const bf = p.flangeWidth / 2
  const d = p.depth / 2
  const tw = p.webThick / 2
  const fz = d - p.flangeThick
  const outline: SectionOutline = {
    outer: [
      { y: -bf, z: d }, { y: bf, z: d }, { y: bf, z: fz }, { y: tw, z: fz },
      { y: tw, z: -fz }, { y: bf, z: -fz }, { y: bf, z: -d }, { y: -bf, z: -d },
      { y: -bf, z: -fz }, { y: -tw, z: -fz }, { y: -tw, z: fz }, { y: -bf, z: fz },
    ],
    holes: [],
  }
  return p.depthAxis === 'y' ? { outer: outline.outer.map(({ y, z }) => ({ y: z, z: y })), holes: [] } : outline
}

export function iShapeChildren(p: IShapeParams): FiberSectionItem[] {
  const bf = p.flangeWidth / 2
  const d = p.depth / 2
  const tw = p.webThick / 2
  const fz = d - p.flangeThick
  return [
    platePatch(p, -bf, fz, bf, d, 'flange'),
    platePatch(p, -tw, -fz, tw, fz, 'web'),
    platePatch(p, -bf, -d, bf, -fz, 'flange'),
  ]
}
