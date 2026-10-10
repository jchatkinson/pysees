import type { FiberSectionItem } from '@/app/types/model'
import type { DistributedRebarParams, EndRebarParams, PlateMeshParams, WallRebarParams } from './types'
import { singleFiber } from './discretize'

/** Canonical width/depth bounds; the section template rotates these to local y/z. */
export interface WallPart { w1: number; w2: number; d1: number; d2: number; part: 'web' | 'flange'; tips: ('start' | 'end')[]; junction?: 'start' | 'end' | 'centre' }

export function endGroups(wall: WallPart, r: EndRebarParams): number[][] {
  const start = wall.part === 'web' ? wall.d1 : wall.w1, end = wall.part === 'web' ? wall.d2 : wall.w2
  const count = Number.isInteger(r.nBars) ? Math.max(0, Math.min(5000, r.nBars)) : 0
  return [...wall.tips, ...(r.junctions && wall.junction ? [wall.junction] : [])].map((position) => Array.from({ length: count }, (_, i) =>
    position === 'start' ? start + r.cover + i * r.spacing
      : position === 'end' ? end - r.cover - i * r.spacing
      : (start + end) / 2 + (i - (count - 1) / 2) * r.spacing))
}

/** Two reinforcement curtains per wall; end groups replace distributed bars within their ranges. */
export function wallRebarChildren(walls: WallPart[], p: PlateMeshParams & WallRebarParams): FiberSectionItem[] {
  const bars = new Map<string, FiberSectionItem>()
  for (const wall of walls) {
    const web = wall.part === 'web', r = web ? p.webRebar : p.flangeRebar, end = p.endRebar
    const start = web ? wall.d1 : wall.w1, finish = web ? wall.d2 : wall.w2
    const low = web ? wall.w1 : wall.d1, high = web ? wall.w2 : wall.d2
    const groups = end ? endGroups(wall, end) : []
    const add = (rebar: DistributedRebarParams | EndRebarParams, position: number) => {
      if (!(2 * rebar.cover < high - low && position >= start && position <= finish)) return
      for (const face of [low + rebar.cover, high - rebar.cover]) {
        const width = web ? face : position, depth = web ? position : face
        const y = p.depthAxis === 'y' ? depth : width, z = p.depthAxis === 'y' ? width : depth
        bars.set(`${y.toPrecision(12)},${z.toPrecision(12)}`, singleFiber(rebar.matId, y, z, rebar.barArea))
      }
    }
    if (r && r.spacing > 0 && Number.isFinite(r.spacing) && finish - start > 2 * r.cover) {
      const intervals = Math.min(5000, Math.ceil((finish - start - 2 * r.cover) / r.spacing))
      for (let i = 0; i <= intervals; i++) {
        const position = start + r.cover + (finish - start - 2 * r.cover) * i / intervals
        if (groups.some((g) => g.length && position >= Math.min(...g) - 1e-12 && position <= Math.max(...g) + 1e-12)) continue
        add(r, position)
      }
    }
    if (end) for (const group of groups) for (const position of group) add(end, position)
  }
  return [...bars.values()]
}
