import { Line } from '@react-three/drei'
import { SceneLabels, type SceneLabelStyle } from './SceneLabels'
import type { GridlineEntity } from '@/app/types/gridlines'
import { gridCrossing } from '@/app/lib/editor/snap'
import { gridDash, gridSize, type Dash } from '@/app/lib/gridlines'

const BUBBLE_STYLE: SceneLabelStyle = { size: 10, weight: 600, color: '#0f172a', anchor: 'center', box: { fill: '#ffffff', stroke: '#94a3b8', width: 18, height: 18, radius: 9 } }

const DEFAULT_2D_TOP = 10
export const GRID_LINE_COLOR = '#94a3b8'

/** Where a grid's line (and its bubble) starts. */
function gridStart(g: GridlineEntity, ndm: 2 | 3, elevationRange: [number, number]): [number, number, number] {
  return ndm === 3 ? [g.start[0] ?? 0, g.start[1] ?? 0, 0] : [g.start[0] ?? 0, elevationRange[0], 0]
}

function Gridline({
  gridline,
  ndm,
  elevationRange,
  dash,
}: {
  gridline: GridlineEntity
  ndm: 2 | 3
  elevationRange: [number, number]
  dash: Dash
}) {
  // Grids only ever store plan (ground-plane) coordinates — the vertical axis
  // (Z in 3D, Y in 2D) belongs to Levels, never to a grid. In 3D a grid is a plan line
  // `[x, y]` drawn at ground (Z=0); in 2D (no depth) a grid is a single X position drawn as a
  // vertical line spanning the model's defined levels.
  const start = gridStart(gridline, ndm, elevationRange)
  const end: [number, number, number] = ndm === 3
    ? [gridline.end[0] ?? 0, gridline.end[1] ?? 0, 0]
    : [gridline.start[0] ?? 0, elevationRange[1], 0]

  return <Line points={[start, end]} color={GRID_LINE_COLOR} lineWidth={1} dashed {...dash} />
}

export function GridlinesLayer({
  gridlines,
  showGridlines,
  ndm,
  levelElevations,
  elevationGrid,
}: {
  gridlines: GridlineEntity[]
  showGridlines: boolean
  ndm: 2 | 3
  levelElevations: number[]
  /** In an elevation on this grid (3D), the grids crossing it are drawn as vertical lines where they cross. */
  elevationGrid?: number | null
}) {
  if (!showGridlines) return null
  const elevationRange: [number, number] = levelElevations.length > 0
    ? [Math.min(0, ...levelElevations), Math.max(0, ...levelElevations)]
    : [0, DEFAULT_2D_TOP]
  const dash = gridDash(gridSize(gridlines, elevationRange))
  const on = ndm === 3 && elevationGrid != null ? gridlines.find((g) => g.id === elevationGrid) : undefined
  if (on) {
    const crossings = gridlines.flatMap((g) => { const p = g.id === on.id ? null : gridCrossing(on, g); return p ? [{ g, p }] : [] })
    const labels = [{ position: gridStart(on, ndm, elevationRange), text: on.label }, ...crossings.map(({ g, p }) => ({ position: [p[0], p[1], elevationRange[0]] as [number, number, number], text: g.label }))]
    return (
      <>
        <Gridline gridline={on} ndm={ndm} elevationRange={elevationRange} dash={dash} />
        {crossings.map(({ g, p }) => (
          <Line key={g.id} points={[[p[0], p[1], elevationRange[0]], [p[0], p[1], Math.max(elevationRange[1], elevationRange[0] + 1e-9)]]} color={GRID_LINE_COLOR} lineWidth={1} dashed {...dash} />
        ))}
        <SceneLabels labels={labels} style={BUBBLE_STYLE} />
      </>
    )
  }
  return (
    <>
      {gridlines.map((gridline) => (
        <Gridline key={gridline.id} gridline={gridline} ndm={ndm} elevationRange={elevationRange} dash={dash} />
      ))}
      <SceneLabels labels={gridlines.map((g) => ({ position: gridStart(g, ndm, elevationRange), text: g.label }))} style={BUBBLE_STYLE} />
    </>
  )
}
