import type { FiberSectionItem } from '@/app/types/model'
import type { LShapeParams, SectionOutline } from '@/app/lib/sections/types'
import { rectPatch } from '@/app/lib/sections/discretize'

// Equal/unequal-leg angle with its corner at the origin, legs running along +y and +z.
export const defaultLShapeParams: LShapeParams = {
  matId: 0, legY: 0.1, legZ: 0.1, thickness: 0.01, nSubdiv: 4,
}

export function lShapeOutline(p: LShapeParams): SectionOutline {
  const { legY, legZ, thickness: t } = p
  return { outer: [{ y: 0, z: 0 }, { y: legY, z: 0 }, { y: legY, z: t }, { y: t, z: t }, { y: t, z: legZ }, { y: 0, z: legZ }], holes: [] }
}

export function lShapeChildren(p: LShapeParams): FiberSectionItem[] {
  const { legY, legZ, thickness: t } = p
  return [
    rectPatch(p.matId, 0, 0, legY, t, p.nSubdiv, p.nSubdiv),
    rectPatch(p.matId, 0, t, t, legZ, p.nSubdiv, p.nSubdiv),
  ]
}
