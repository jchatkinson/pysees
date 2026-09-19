import type { FiberSectionItem } from '@/app/types/model'
import type { CShapeParams, SectionOutline } from '@/app/lib/sections/types'
import { rectPatch } from '@/app/lib/sections/discretize'

// Channel: web along y=0..webThick (full height), flanges extend from the web to y=flangeWidth, opening toward +y.
export const defaultCShapeParams: CShapeParams = {
  matId: 0, depth: 0.3, flangeWidth: 0.1, flangeThick: 0.012, webThick: 0.008, nSubdiv: 4,
}

export function cShapeOutline(p: CShapeParams): SectionOutline {
  const d = p.depth / 2
  const tw = p.webThick
  const bf = p.flangeWidth
  const fz = d - p.flangeThick
  return {
    outer: [
      { y: 0, z: d }, { y: bf, z: d }, { y: bf, z: fz }, { y: tw, z: fz },
      { y: tw, z: -fz }, { y: bf, z: -fz }, { y: bf, z: -d }, { y: 0, z: -d },
    ],
    holes: [],
  }
}

export function cShapeChildren(p: CShapeParams): FiberSectionItem[] {
  const d = p.depth / 2
  const tw = p.webThick
  const bf = p.flangeWidth
  const fz = d - p.flangeThick
  return [
    rectPatch(p.matId, 0, -d, tw, d, p.nSubdiv, p.nSubdiv),
    rectPatch(p.matId, tw, fz, bf, d, p.nSubdiv, p.nSubdiv),
    rectPatch(p.matId, tw, -d, bf, -fz, p.nSubdiv, p.nSubdiv),
  ]
}
