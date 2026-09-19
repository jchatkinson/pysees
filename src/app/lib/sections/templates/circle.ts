import type { FiberSectionItem } from '@/app/types/model'
import type { CircleSectionParams, SectionOutline } from '@/app/lib/sections/types'
import { circPatch, circleOutlinePoints, ringBars, singleFiber } from '@/app/lib/sections/discretize'

export const defaultCircleParams: CircleSectionParams = {
  coreMatId: 0, diameter: 0.4, nSubdivCirc: 16, nSubdivRad: 6,
  rebar: { matId: 0, barArea: 3.14e-4, cover: 0.04, nBars: 8 },
}

export function circleOutline(p: CircleSectionParams): SectionOutline {
  return { outer: circleOutlinePoints(p.diameter / 2), holes: [] }
}

export function circleChildren(p: CircleSectionParams): FiberSectionItem[] {
  const r = p.diameter / 2
  const children: FiberSectionItem[] = [circPatch(p.coreMatId, 0, 0, 0, r, p.nSubdivCirc, p.nSubdivRad)]
  if (p.rebar) {
    for (const bar of ringBars(r - p.rebar.cover, p.rebar.nBars)) {
      children.push(singleFiber(p.rebar.matId, bar.y, bar.z, p.rebar.barArea))
    }
  }
  return children
}
