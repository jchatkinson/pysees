import type { FiberSectionItem } from '@/app/types/model'
import type { PlateMeshParams } from './types'
import { rectPatch, rectPerimeterBars, singleFiber } from './discretize'

export function platePatch(p: PlateMeshParams & { matId: number }, y1: number, z1: number, y2: number, z2: number, part: 'web' | 'flange'): FiberSectionItem {
  const nY = (part === 'web' ? p.nWebY : p.nFlangeY) ?? p.nSubdiv ?? 4
  const nZ = (part === 'web' ? p.nWebZ : p.nFlangeZ) ?? p.nSubdiv ?? 4
  return p.depthAxis === 'y' ? rectPatch(p.matId, z1, y1, z2, y2, nY, nZ) : rectPatch(p.matId, y1, z1, y2, z2, nY, nZ)
}

/** Reinforce each web/flange patch perimeter; shared bar positions are emitted once. */
export function reinforcePatches(children: FiberSectionItem[], p: PlateMeshParams): FiberSectionItem[] {
  if (!p.rebar) return children
  const { matId, barArea, cover, nBarsY, nBarsZ } = p.rebar
  const seen = new Set<string>()
  const bars: FiberSectionItem[] = []
  for (const { args: a } of children) {
    const y1 = Number(a.y1), y2 = Number(a.y2), z1 = Number(a.z1), z2 = Number(a.z2)
    if (2 * cover >= Math.min(y2 - y1, z2 - z1)) continue
    for (const bar of rectPerimeterBars((y2 - y1) / 2, (z2 - z1) / 2, cover, nBarsY, nBarsZ)) {
      const y = bar.y + (y1 + y2) / 2, z = bar.z + (z1 + z2) / 2
      const key = `${y.toPrecision(12)},${z.toPrecision(12)}`
      if (!seen.has(key)) { seen.add(key); bars.push(singleFiber(matId, y, z, barArea)) }
    }
  }
  return [...children, ...bars]
}
