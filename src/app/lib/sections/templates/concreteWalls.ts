import type { FiberSectionItem } from '@/app/types/model'
import type { ConcreteIShapeParams, ConcreteLShapeParams, SectionOutline } from '../types'
import { platePatch } from '../plateMesh'
import { wallRebarChildren, type WallPart } from '../wallRebar'
import { defaultConcreteCParams } from './concreteC'

const wallDefaults = defaultConcreteCParams
export const defaultConcreteIParams: ConcreteIShapeParams = { ...wallDefaults, wallShape: 'i' }
export const defaultConcreteLParams: ConcreteLShapeParams = { ...wallDefaults, wallShape: 'l', legY: 0.9144, legZ: 2.4384, thickness: 0.2032 }
export type ConcreteWallParams = ConcreteIShapeParams | ConcreteLShapeParams

export function concreteWallParts(p: ConcreteWallParams): WallPart[] {
  if (p.wallShape === 'i') {
    const d = p.depth / 2, f = d - p.flangeThick, b = p.flangeWidth / 2, t = p.webThick / 2
    return [
      { w1: -t, w2: t, d1: -f, d2: f, part: 'web', tips: [] },
      { w1: -b, w2: b, d1: f, d2: d, part: 'flange', tips: ['start', 'end'], junction: 'centre' },
      { w1: -b, w2: b, d1: -d, d2: -f, part: 'flange', tips: ['start', 'end'], junction: 'centre' },
    ]
  }
  return [
    { w1: 0, w2: p.webThick, d1: p.flangeThick, d2: p.legZ, part: 'web', tips: ['end'], junction: 'start' },
    { w1: 0, w2: p.legY, d1: 0, d2: p.flangeThick, part: 'flange', tips: ['end'], junction: 'start' },
  ]
}

export function concreteWallChildren(p: ConcreteWallParams): FiberSectionItem[] {
  const walls = concreteWallParts(p)
  return [...walls.map((w) => platePatch(p, w.w1, w.d1, w.w2, w.d2, w.part)), ...wallRebarChildren(walls, p)]
}

export function concreteLOutline(p: ConcreteLShapeParams): SectionOutline {
  const outer = [{ y: 0, z: 0 }, { y: p.legY, z: 0 }, { y: p.legY, z: p.flangeThick }, { y: p.webThick, z: p.flangeThick }, { y: p.webThick, z: p.legZ }, { y: 0, z: p.legZ }]
  return { outer: p.depthAxis === 'y' ? outer.map(({ y, z }) => ({ y: z, z: y })) : outer, holes: [] }
}
