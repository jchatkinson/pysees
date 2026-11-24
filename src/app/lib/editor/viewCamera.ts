import { Vector3 } from 'three'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import { gridSlab, type ViewMode } from './viewSlice'

/** A stored view mode that no longer fits the model (a deleted level or grid, a plan in 2D) falls back to 3D. */
export function validViewMode(mode: ViewMode, levels: LevelEntity[], grids: GridlineEntity[], ndm: 2 | 3): ViewMode {
  if (mode.kind === 'plan') return ndm === 3 && mode.level >= -1 && mode.level < levels.length ? mode : { kind: '3d' }
  if (mode.kind === 'elevation' && mode.gridId !== null) return ndm === 3 && grids.some((g) => g.id === mode.gridId) ? mode : { kind: '3d' }
  return mode
}

/**
 * Camera for a plan or elevation: `back` points from the target to the camera, `up` is the screen's up. Plans look down with +Y up;
 * a grid elevation looks at the grid so it runs left to right (camera on the side that makes `right = grid direction`, Z up).
 * Null for the 3D view.
 */
export function viewCamera(mode: ViewMode, grids: GridlineEntity[], ndm: 2 | 3): { back: Vector3; up: [number, number, number] } | null {
  if (mode.kind === '3d') return null
  if (ndm === 2) return { back: new Vector3(0, 0, 1), up: [0, 1, 0] }
  if (mode.kind === 'plan') return { back: new Vector3(0, 0, 1), up: [0, 1, 0] }
  const slab = mode.gridId === null ? null : gridSlab(grids, mode.gridId, 0)
  if (!slab) return { back: new Vector3(0, -1, 0), up: [0, 0, 1] }
  // right = up × back = dir  =>  back = dir × Z
  return { back: new Vector3(slab.dir.y, -slab.dir.x, 0), up: [0, 0, 1] }
}

/** Grids parallel to `gridId`, ordered by their offset along its normal (the order elevations step through). */
export function parallelGrids(grids: GridlineEntity[], gridId: number): GridlineEntity[] {
  const slab = gridSlab(grids, gridId, 0)
  if (!slab) return []
  // Step towards +X / +Y whichever way the grid was drawn.
  const sign = slab.normal.x < -1e-9 || (Math.abs(slab.normal.x) <= 1e-9 && slab.normal.y < 0) ? -1 : 1
  const offset = (g: GridlineEntity) => sign * (slab.normal.x * ((g.start[0] ?? 0) - slab.origin.x) + slab.normal.y * ((g.start[1] ?? 0) - slab.origin.y))
  return grids.filter((g) => {
    const dx = (g.end[0] ?? 0) - (g.start[0] ?? 0), dy = (g.end[1] ?? 0) - (g.start[1] ?? 0)
    return Math.abs(slab.dir.x * dy - slab.dir.y * dx) <= 1e-6 * (Math.hypot(dx, dy) || 1)
  }).sort((a, b) => offset(a) - offset(b))
}

/** The next story (plan) or the next parallel grid (elevation) in direction `delta` (±1); null at the end or in 3D. */
export function stepView(mode: ViewMode, levels: LevelEntity[], grids: GridlineEntity[], delta: 1 | -1): ViewMode | null {
  if (mode.kind === 'plan') { const level = mode.level + delta; return level >= -1 && level < levels.length ? { kind: 'plan', level } : null }
  if (mode.kind === 'elevation' && mode.gridId !== null) {
    const family = parallelGrids(grids, mode.gridId)
    const next = family[family.findIndex((g) => g.id === mode.gridId) + delta]
    return next ? { kind: 'elevation', gridId: next.id } : null
  }
  return null
}
