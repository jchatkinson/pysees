import { concreteWallParts, type ConcreteWallParams } from './templates/concreteWalls'
import type { DistributedRebarParams, EndRebarParams } from './types'
import { endGroups } from './wallRebar'
import type { FiberSectionItem } from '@/app/types/model'

/** Keep invalid geometry and reinforcement out of saved sections. Material references are checked separately. */
export function sectionGeometryError(children: FiberSectionItem[], params: Record<string, unknown> | null): string | null {
  for (const { kind, subType, args: a } of children) {
    if (Object.values(a).some((v) => typeof v === 'number' && !Number.isFinite(v))) return 'All dimensions must be finite numbers.'
    if (kind === 'patch' && subType === 'rect' && (Number(a.y2) <= Number(a.y1) || Number(a.z2) <= Number(a.z1))) return 'Patch dimensions must be positive. Check the section and wall thicknesses.'
    if (kind === 'patch' && subType === 'circ' && (Number(a.extRad) <= Number(a.intRad) || Number(a.intRad) < 0)) return 'Wall thickness must be smaller than the outer radius.'
    for (const key of ['numSubdivY', 'numSubdivZ', 'numSubdivCirc', 'numSubdivRad']) {
      if (key in a && (!Number.isInteger(a[key]) || Number(a[key]) < 1)) return 'Fiber subdivision counts must be positive integers.'
    }
    if (kind === 'fiber' && Number(a.A) <= 0) return 'Bar area must be positive.'
  }
  if (params && 'diameter' in params && 'thickness' in params && Number(params.thickness) >= Number(params.diameter) / 2) return 'Wall thickness must be smaller than the outer radius.'
  const rebar = params?.rebar as { cover: number; barArea: number } | null | undefined
  if (rebar) {
    if (!Number.isFinite(rebar.cover) || rebar.cover < 0 || !Number.isFinite(rebar.barArea) || rebar.barArea <= 0) return 'Rebar cover must be nonnegative and bar area must be positive.'
    const fits = children.filter((c) => c.kind === 'patch').every(({ subType, args: a }) => subType === 'circ'
      ? rebar.cover < Number(a.extRad)
      : 2 * rebar.cover < Math.min(Number(a.y2) - Number(a.y1), Number(a.z2) - Number(a.z1)))
    if (!fits) return 'Rebar cover must fit inside every web, flange, or core patch. Reduce cover or increase thickness.'
  }
  if (params?.wallShape === 'i' || params?.wallShape === 'l') {
    const p = params as unknown as ConcreteWallParams
    const fits = p.wallShape === 'i' ? p.webThick < p.flangeWidth && 2 * p.flangeThick < p.depth : p.webThick < p.legY && p.flangeThick < p.legZ
    if (!fits) return 'Web and flange thicknesses must fit inside the wall section dimensions.'
    for (const wall of concreteWallParts(p)) {
      const web = wall.part === 'web', length = web ? wall.d2 - wall.d1 : wall.w2 - wall.w1, thickness = web ? wall.w2 - wall.w1 : wall.d2 - wall.d1
      const reinforcement: (DistributedRebarParams | EndRebarParams | null)[] = [web ? p.webRebar : p.flangeRebar, ...(p.endRebar && (wall.tips.length || wall.junction && p.endRebar.junctions) ? [p.endRebar] : [])]
      for (const r of reinforcement) {
        if (!r) continue
        if (!(Number.isFinite(r.cover) && r.cover >= 0 && 2 * r.cover < Math.min(thickness, length))) return `${web ? 'Web' : 'Flange'} bar cover must fit inside the wall thickness and length.`
        if (!(Number.isFinite(r.barArea) && r.barArea > 0 && Number.isFinite(r.spacing) && r.spacing > 0)) return 'Reinforcing bar area and spacing must be positive finite numbers.'
        if ('nBars' in r) {
          if (!(Number.isInteger(r.nBars) && r.nBars > 0 && r.nBars <= 5000)) return 'End bar count must be a positive integer up to 5000.'
          const start = (web ? wall.d1 : wall.w1) + r.cover, finish = (web ? wall.d2 : wall.w2) - r.cover
          const groups = endGroups(wall, r).map((g) => ({ min: Math.min(...g), max: Math.max(...g) })).sort((a, b) => a.min - b.min)
          if (groups.some((g, i) => g.min < start - 1e-12 || g.max > finish + 1e-12 || i > 0 && g.min <= groups[i - 1].max)) return 'Concentrated end groups must fit within each wall without overlapping.'
        } else if (Math.ceil((length - 2 * r.cover) / r.spacing) > 5000) return 'Distributed spacing creates too many bars. Increase spacing.'
      }
    }
  } else if (params && 'webRebar' in params) {
    const depth = Number(params.depth), width = Number(params.flangeWidth), tf = Number(params.flangeThick), tw = Number(params.webThick)
    if (!(tw < width && 2 * tf < depth)) return 'Web and flange thicknesses must fit inside the C-shape dimensions.'
    for (const key of ['webRebar', 'flangeRebar', 'endRebar']) {
      const r = params[key] as { cover: number; barArea: number; spacing: number; nBars?: number; junctions?: boolean } | null
      if (!r) continue
      const thickness = key === 'webRebar' ? tw : tf, length = key === 'webRebar' ? depth - 2 * tf : width
      if (!(Number.isFinite(r.cover) && r.cover >= 0 && 2 * r.cover < Math.min(thickness, length))) return `${key === 'webRebar' ? 'Web' : 'Flange'} bar cover must fit inside the wall thickness and length.`
      if (!(Number.isFinite(r.barArea) && r.barArea > 0 && Number.isFinite(r.spacing) && r.spacing > 0)) return 'Reinforcing bar area and spacing must be positive finite numbers.'
      if (key === 'endRebar') {
        if (!(Number.isInteger(r.nBars) && Number(r.nBars) > 0 && Number(r.nBars) <= 5000)) return 'End bar count must be a positive integer up to 5000.'
        const extent = (Number(r.nBars) - 1) * r.spacing
        if (extent >= width - 2 * r.cover || (r.junctions && 2 * extent >= width - 2 * r.cover)) return 'Concentrated end groups must fit within the flange without overlapping.'
      } else if (Math.ceil((length - 2 * r.cover) / r.spacing) > 5000) return 'Distributed spacing creates too many bars. Increase spacing.'
    }
  }
  return null
}
