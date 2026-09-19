import type { FiberSectionItem } from '@/app/types/model'
import type { IShapeParams, SectionOutline } from '@/app/lib/sections/types'
import { rectPatch } from '@/app/lib/sections/discretize'

export const defaultIShapeParams: IShapeParams = {
  matId: 0, depth: 0.3, flangeWidth: 0.15, flangeThick: 0.012, webThick: 0.008, nSubdiv: 4,
}

export function iShapeOutline(p: IShapeParams): SectionOutline {
  const bf = p.flangeWidth / 2
  const d = p.depth / 2
  const tw = p.webThick / 2
  const fz = d - p.flangeThick
  return {
    outer: [
      { y: -bf, z: d }, { y: bf, z: d }, { y: bf, z: fz }, { y: tw, z: fz },
      { y: tw, z: -fz }, { y: bf, z: -fz }, { y: bf, z: -d }, { y: -bf, z: -d },
      { y: -bf, z: -fz }, { y: -tw, z: -fz }, { y: -tw, z: fz }, { y: -bf, z: fz },
    ],
    holes: [],
  }
}

export function iShapeChildren(p: IShapeParams): FiberSectionItem[] {
  const bf = p.flangeWidth / 2
  const d = p.depth / 2
  const tw = p.webThick / 2
  const fz = d - p.flangeThick
  return [
    rectPatch(p.matId, -bf, fz, bf, d, p.nSubdiv, p.nSubdiv),
    rectPatch(p.matId, -tw, -fz, tw, fz, p.nSubdiv, p.nSubdiv),
    rectPatch(p.matId, -bf, -d, bf, -fz, p.nSubdiv, p.nSubdiv),
  ]
}
