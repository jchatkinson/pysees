import type { ElementEntity, NodeEntity } from '@/app/types/model'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import { levelElevations } from '@/app/lib/levels'

/**
 * What the viewport shows. `plan` is a 3D model's story plan at a level (index into `levels`, -1 = base, z = 0); `elevation`
 * is the vertical slice along a grid line (`gridId: null` = the whole model seen from the front, the only elevation of a 2D model).
 */
export type ViewMode = { kind: '3d' } | { kind: 'plan'; level: number } | { kind: 'elevation'; gridId: number | null }

/** Elements and nodes drawn normally, plus the elements of the story above drawn as dashed ghosts (plan only). */
export interface ViewSlice {
  nodes: Map<number, NodeEntity>
  elements: Map<number, ElementEntity>
  ghostElements: ElementEntity[]
}

const z = (n: NodeEntity) => n.coords[2] ?? 0

/** Elevation of plan level `i` (-1 = base at 0). */
export function planElevation(levels: LevelEntity[], i: number): number {
  return i < 0 ? 0 : levelElevations(levels)[i] ?? 0
}

/** The elevation slab of a grid: its line, and how far the slab reaches on each side (half way to the nearest parallel grid). */
export function gridSlab(grids: GridlineEntity[], gridId: number, fallback: number) {
  const g = grids.find((x) => x.id === gridId)
  if (!g) return null
  const sx = g.start[0] ?? 0, sy = g.start[1] ?? 0
  const dx = (g.end[0] ?? 0) - sx, dy = (g.end[1] ?? 0) - sy
  const len = Math.hypot(dx, dy) || 1
  const dir = { x: dx / len, y: dy / len }
  const normal = { x: -dir.y, y: dir.x }
  let neg = Infinity, pos = Infinity
  for (const o of grids) {
    if (o.id === g.id) continue
    const ox = (o.end[0] ?? 0) - (o.start[0] ?? 0), oy = (o.end[1] ?? 0) - (o.start[1] ?? 0)
    const olen = Math.hypot(ox, oy) || 1
    if (Math.abs(dir.x * oy - dir.y * ox) / olen > 1e-6) continue // not parallel
    const d = normal.x * ((o.start[0] ?? 0) - sx) + normal.y * ((o.start[1] ?? 0) - sy)
    if (d > 1e-9) pos = Math.min(pos, d)
    else if (d < -1e-9) neg = Math.min(neg, -d)
  }
  return { origin: { x: sx, y: sy }, dir, normal, below: Number.isFinite(neg) ? neg / 2 : fallback, above: Number.isFinite(pos) ? pos / 2 : fallback }
}

/**
 * Filter the model to a view. Plan at level i (ETABS convention): every element whose top lies in (z(i-1), z(i)], so the floor
 * and the columns/walls under it, but not the floor below; the story above (z(i), z(i+1)] comes back as ghosts. Elevation on a
 * grid: elements whose nodes all lie within its slab. Nodes in the range are shown even when only elements outside it use them (supports on a base plan). Returns null for an unfiltered view.
 */
export function viewSlice(mode: ViewMode, nodes: Map<number, NodeEntity>, elements: Map<number, ElementEntity>, levels: LevelEntity[], grids: GridlineEntity[], ndm: 2 | 3): ViewSlice | null {
  if (mode.kind === '3d' || ndm === 2 || (mode.kind === 'elevation' && mode.gridId === null)) return null
  let extent = 0
  for (const n of nodes.values()) for (const c of n.coords) extent = Math.max(extent, Math.abs(c))
  const eps = 1e-6 * Math.max(1, extent)

  let inMain: (n: NodeEntity) => boolean
  let elementIn: (ns: NodeEntity[]) => 'main' | 'ghost' | null
  if (mode.kind === 'plan') {
    const elev = levelElevations(levels)
    const top = planElevation(levels, mode.level)
    const bottom = mode.level < 0 ? -Infinity : planElevation(levels, mode.level - 1)
    const next = mode.level + 1 < elev.length ? elev[mode.level + 1] : Infinity
    inMain = (n) => z(n) > bottom + eps && z(n) <= top + eps
    elementIn = (ns) => {
      const hi = Math.max(...ns.map(z))
      if (hi > bottom + eps && hi <= top + eps) return 'main'
      return hi > top + eps && hi <= next + eps ? 'ghost' : null
    }
  } else {
    const slab = gridSlab(grids, mode.gridId!, Math.max(eps, 1e-3 * extent))
    if (!slab) return null
    const off = (n: NodeEntity) => slab.normal.x * ((n.coords[0] ?? 0) - slab.origin.x) + slab.normal.y * ((n.coords[1] ?? 0) - slab.origin.y)
    inMain = (n) => off(n) >= -slab.below - eps && off(n) <= slab.above + eps
    elementIn = (ns) => (ns.every(inMain) ? 'main' : null)
  }

  const outNodes = new Map<number, NodeEntity>()
  const outElements = new Map<number, ElementEntity>()
  const ghostElements: ElementEntity[] = []
  for (const e of elements.values()) {
    const ns = e.nodes.map((id) => nodes.get(id))
    if (ns.some((n) => !n)) continue
    const where = elementIn(ns as NodeEntity[])
    if (where === 'main') { outElements.set(e.id, e); for (const n of ns) outNodes.set(n!.id, n!) }
    else if (where === 'ghost') ghostElements.push(e)
  }
  for (const n of nodes.values()) if (inMain(n)) outNodes.set(n.id, n)
  return { nodes: outNodes, elements: outElements, ghostElements }
}

/** Short label for the viewport corner: "Plan @ L3 (z = 9)", "Elevation B". */
export function viewLabel(mode: ViewMode, levels: LevelEntity[], grids: GridlineEntity[], fmt: (v: number) => string): string {
  if (mode.kind === '3d') return '3D'
  if (mode.kind === 'plan') return `Plan @ ${mode.level < 0 ? 'Base' : levels[mode.level]?.label ?? '?'} (z = ${fmt(planElevation(levels, mode.level))})`
  if (mode.gridId === null) return 'Elevation'
  return `Elevation ${grids.find((g) => g.id === mode.gridId)?.label ?? '?'}`
}
