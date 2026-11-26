import { Line } from '@react-three/drei'
import { SceneLabels, type SceneLabelStyle } from './SceneLabels'
import type { LevelEntity } from '@/app/types/levels'
import type { GridlineEntity } from '@/app/types/gridlines'
import { levelElevations } from '@/app/lib/levels'
import { GRID_LINE_COLOR } from './Gridlines'
import { gridDash, gridSize } from '@/app/lib/gridlines'

const DEFAULT_HALF_EXTENT = 5
const TEXT_OFFSET = 0.4
const LEVEL_LABEL_STYLE: SceneLabelStyle = { size: 11, weight: 600, color: GRID_LINE_COLOR, anchor: 'right', offset: [-4, 0] }

function anchorPoint(gridlines: GridlineEntity[], ndm: 2 | 3): [number, number] {
  const xs = gridlines.flatMap((g) => [g.start[0] ?? 0, g.end[0] ?? 0])
  const ys = ndm === 3 ? gridlines.flatMap((g) => [g.start[1] ?? 0, g.end[1] ?? 0]) : []
  return [
    xs.length ? Math.min(...xs) : -DEFAULT_HALF_EXTENT,
    ys.length ? Math.min(...ys) : (ndm === 3 ? -DEFAULT_HALF_EXTENT : 0),
  ]
}

function Level({ elevation, ndm, gridlines }: { elevation: number; ndm: 2 | 3; gridlines: GridlineEntity[] }) {
  // Lifted a hair off the level: floors and slabs have their top in this plane, and coplanar lines z-fight with them.
  const size = gridSize(gridlines), dash = gridDash(size), z = elevation + size * 5e-4
  return (
    <>
      {/* Redraw the actual grids at this level's elevation, rather than a generic bounding box. */}
      {ndm === 3
        ? gridlines.map((g) => (
          <Line
            key={g.id}
            points={[
              [g.start[0] ?? 0, g.start[1] ?? 0, z],
              [g.end[0] ?? 0, g.end[1] ?? 0, z],
            ]}
            color={GRID_LINE_COLOR}
            lineWidth={1}
            dashed
            {...dash}
          />
        ))
        : gridlines.length > 0 && (
          <Line
            points={[
              [Math.min(...gridlines.map((g) => g.start[0] ?? 0)), elevation, 0],
              [Math.max(...gridlines.map((g) => g.start[0] ?? 0)), elevation, 0],
            ]}
            color={GRID_LINE_COLOR}
            lineWidth={1}
            dashed
            {...dash}
          />
        )}
    </>
  )
}

export function LevelsLayer({
  levels,
  gridlines,
  ndm,
  showLevels,
  only,
}: {
  levels: LevelEntity[]
  gridlines: GridlineEntity[]
  ndm: 2 | 3
  showLevels: boolean
  /** Draw only this level (a plan view); -1 = base, which has no level line. */
  only?: number
}) {
  if (!showLevels || levels.length === 0) return null
  const elevations = levelElevations(levels)
  const [ax, ay] = anchorPoint(gridlines, ndm)
  const shown = levels.flatMap((level, i) => (only !== undefined && i !== only ? [] : [{ level, elevation: elevations[i] }]))
  const labels = shown.map(({ level, elevation }) => ({ text: level.label, position: (ndm === 3 ? [ax - TEXT_OFFSET, ay - TEXT_OFFSET, elevation] : [ax - TEXT_OFFSET, elevation, ay - TEXT_OFFSET]) as [number, number, number] }))
  return (
    <>
      {shown.map(({ level, elevation }) => <Level key={level.id} elevation={elevation} ndm={ndm} gridlines={gridlines} />)}
      <SceneLabels labels={labels} style={LEVEL_LABEL_STYLE} />
    </>
  )
}
