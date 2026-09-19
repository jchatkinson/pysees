import { Billboard, Line, Text } from '@react-three/drei'
import type { LevelEntity } from '@/app/types/levels'
import type { GridlineEntity } from '@/app/types/gridlines'
import { levelElevations } from '@/app/lib/levels'
import { GRID_LINE_COLOR } from './Gridlines'

const DEFAULT_HALF_EXTENT = 5
const TEXT_OFFSET = 0.4

function anchorPoint(gridlines: GridlineEntity[], ndm: 2 | 3): [number, number] {
  const xs = gridlines.flatMap((g) => [g.start[0] ?? 0, g.end[0] ?? 0])
  const zs = ndm === 3 ? gridlines.flatMap((g) => [g.start[1] ?? 0, g.end[1] ?? 0]) : []
  return [
    xs.length ? Math.min(...xs) : -DEFAULT_HALF_EXTENT,
    zs.length ? Math.min(...zs) : (ndm === 3 ? -DEFAULT_HALF_EXTENT : 0),
  ]
}

function Level({
  level,
  elevation,
  ndm,
  gridlines,
  anchor,
}: {
  level: LevelEntity
  elevation: number
  ndm: 2 | 3
  gridlines: GridlineEntity[]
  anchor: [number, number]
}) {
  return (
    <>
      {/* Redraw the actual grids at this level's elevation, rather than a generic bounding box. */}
      {ndm === 3
        ? gridlines.map((g) => (
          <Line
            key={g.id}
            points={[
              [g.start[0] ?? 0, elevation, g.start[1] ?? 0],
              [g.end[0] ?? 0, elevation, g.end[1] ?? 0],
            ]}
            color={GRID_LINE_COLOR}
            lineWidth={1}
            dashed
            dashScale={8}
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
            dashScale={8}
          />
        )}
      <Billboard position={[anchor[0] - TEXT_OFFSET, elevation, anchor[1] - TEXT_OFFSET]}>
        <Text fontSize={0.28} color={GRID_LINE_COLOR} anchorX="right" anchorY="middle">
          {level.label}
        </Text>
      </Billboard>
    </>
  )
}

export function LevelsLayer({
  levels,
  gridlines,
  ndm,
  showLevels,
}: {
  levels: LevelEntity[]
  gridlines: GridlineEntity[]
  ndm: 2 | 3
  showLevels: boolean
}) {
  if (!showLevels || levels.length === 0) return null
  const elevations = levelElevations(levels)
  const anchor = anchorPoint(gridlines, ndm)
  return (
    <>
      {levels.map((level, i) => (
        <Level key={level.id} level={level} elevation={elevations[i]} ndm={ndm} gridlines={gridlines} anchor={anchor} />
      ))}
    </>
  )
}
