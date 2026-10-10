import type { FiberSectionItem } from '@/app/types/model'
import type { ConcreteCShapeParams, DistributedRebarParams } from '../types'
import { platePatch } from '../plateMesh'
import { singleFiber } from '../discretize'
import { defaultCShapeParams } from './cShape'

// Metres: 8 ft overall depth, 3 ft flange width, 8 in walls; cover is to bar centres.
const distributed: DistributedRebarParams = { matId: 0, barArea: 0.0002, cover: 0.05, spacing: 0.2 }
export const defaultConcreteCParams: ConcreteCShapeParams = {
  ...defaultCShapeParams, depth: 2.4384, flangeWidth: 0.9144, flangeThick: 0.2032, webThick: 0.2032,
  nWebY: 24, nWebZ: 4, nFlangeY: 4, nFlangeZ: 12,
  webRebar: distributed, flangeRebar: distributed, endRebar: null,
}

/** Full-width flanges and a clear-height web. Reinforcement runs along both faces of each wall. */
export function concreteCChildren(p: ConcreteCShapeParams): FiberSectionItem[] {
  const d = p.depth / 2, f = d - p.flangeThick, b = p.flangeWidth, t = p.webThick
  const children = [platePatch(p, 0, -f, t, f, 'web'), platePatch(p, 0, f, b, d, 'flange'), platePatch(p, 0, -d, b, -f, 'flange')]
  const add = (r: DistributedRebarParams | NonNullable<ConcreteCShapeParams['endRebar']>, width: number, depth: number) => {
    children.push(p.depthAxis === 'y' ? singleFiber(r.matId, depth, width, r.barArea) : singleFiber(r.matId, width, depth, r.barArea))
  }
  const along = (start: number, end: number, spacing: number) => {
    if (!(end > start && spacing > 0 && Number.isFinite(spacing))) return []
    const n = Math.min(5000, Math.ceil((end - start) / spacing))
    return Array.from({ length: n + 1 }, (_, i) => start + (end - start) * i / n)
  }
  if (p.webRebar) {
    const r = p.webRebar
    if (r.cover * 2 < t) for (const depth of along(-f + r.cover, f - r.cover, r.spacing)) for (const width of [r.cover, t - r.cover]) add(r, width, depth)
  }
  if (p.flangeRebar) {
    const r = p.flangeRebar, end = p.endRebar
    const tipStart = end ? b - end.cover - (end.nBars - 1) * end.spacing : Infinity
    const junctionEnd = end?.junctions ? end.cover + (end.nBars - 1) * end.spacing : -Infinity
    if (r.cover * 2 < p.flangeThick) for (const width of along(r.cover, b - r.cover, r.spacing)) {
      // Concentrated groups replace the distributed bars in their end regions.
      if (width >= tipStart || width <= junctionEnd) continue
      for (const depth of [-d + r.cover, -f - r.cover, f + r.cover, d - r.cover]) add(r, width, depth)
    }
  }
  if (p.endRebar) {
    const r = p.endRebar
    if (r.cover * 2 < p.flangeThick && r.spacing > 0 && Number.isInteger(r.nBars) && r.nBars > 0) {
      for (let i = 0; i < Math.min(5000, r.nBars); i++) {
        const widths = [b - r.cover - i * r.spacing, ...(r.junctions ? [r.cover + i * r.spacing] : [])]
        for (const width of widths) for (const depth of [-d + r.cover, -f - r.cover, f + r.cover, d - r.cover]) add(r, width, depth)
      }
    }
  }
  return children
}
