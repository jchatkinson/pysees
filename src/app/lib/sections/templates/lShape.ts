import type { FiberSectionItem } from '@/app/types/model'
import type { LShapeParams, SectionOutline } from '@/app/lib/sections/types'
import { platePatch } from '@/app/lib/sections/plateMesh'

// Equal/unequal-leg angle with its corner at the origin, legs running along +y and +z.
export const defaultLShapeParams: LShapeParams = {
  matId: 0, legY: 0.1, legZ: 0.1, thickness: 0.01, depthAxis: 'y', nWebY: 12, nWebZ: 2, nFlangeY: 2, nFlangeZ: 8,
}

export function lShapeOutline(p: LShapeParams): SectionOutline {
  const { legY, legZ, thickness: t } = p
  const outline: SectionOutline = { outer: [{ y: 0, z: 0 }, { y: legY, z: 0 }, { y: legY, z: t }, { y: t, z: t }, { y: t, z: legZ }, { y: 0, z: legZ }], holes: [] }
  return p.depthAxis === 'y' ? { outer: outline.outer.map(({ y, z }) => ({ y: z, z: y })), holes: [] } : outline
}

export function lShapeChildren(p: LShapeParams): FiberSectionItem[] {
  const { legY, legZ, thickness: t } = p
  return [
    platePatch(p, 0, 0, legY, t, 'flange'),
    platePatch(p, 0, t, t, legZ, 'web'),
  ]
}
