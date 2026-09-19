import type { FiberSectionItem } from '@/app/types/model'
import type { SectionOutline, TubeParams } from '@/app/lib/sections/types'
import { circPatch, circleOutlinePoints } from '@/app/lib/sections/discretize'

export const defaultTubeParams: TubeParams = {
  matId: 0, diameter: 0.3, thickness: 0.01, nSubdivCirc: 24, nSubdivRad: 2,
}

export function tubeOutline(p: TubeParams): SectionOutline {
  const rOuter = p.diameter / 2
  const rInner = Math.max(0, rOuter - p.thickness)
  return { outer: circleOutlinePoints(rOuter), holes: rInner > 0 ? [circleOutlinePoints(rInner)] : [] }
}

export function tubeChildren(p: TubeParams): FiberSectionItem[] {
  const rOuter = p.diameter / 2
  const rInner = Math.max(0, rOuter - p.thickness)
  return [circPatch(p.matId, 0, 0, rInner, rOuter, p.nSubdivCirc, p.nSubdivRad)]
}
