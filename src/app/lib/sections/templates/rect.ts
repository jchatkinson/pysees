import type { FiberSectionItem } from '@/app/types/model'
import type { RectSectionParams, SectionOutline } from '@/app/lib/sections/types'
import { rectPatch, rectPerimeterBars, singleFiber } from '@/app/lib/sections/discretize'

export const defaultRectParams: RectSectionParams = {
  coreMatId: 0, width: 0.3, depth: 0.5, nSubdivY: 8, nSubdivZ: 8,
  rebar: { matId: 0, barArea: 3.14e-4, cover: 0.04, nBarsY: 3, nBarsZ: 3 },
}

export function rectOutline(p: RectSectionParams): SectionOutline {
  const y = p.width / 2
  const z = p.depth / 2
  return { outer: [{ y: -y, z: -z }, { y, z: -z }, { y, z }, { y: -y, z }], holes: [] }
}

export function rectChildren(p: RectSectionParams): FiberSectionItem[] {
  const y = p.width / 2
  const z = p.depth / 2
  const children: FiberSectionItem[] = [rectPatch(p.coreMatId, -y, -z, y, z, p.nSubdivY, p.nSubdivZ)]
  if (p.rebar) {
    for (const bar of rectPerimeterBars(y, z, p.rebar.cover, p.rebar.nBarsY, p.rebar.nBarsZ)) {
      children.push(singleFiber(p.rebar.matId, bar.y, bar.z, p.rebar.barArea))
    }
  }
  return children
}
