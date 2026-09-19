import { Html, Line } from '@react-three/drei'
import type { GridlineEntity } from '@/app/types/gridlines'

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#0f172a',
  background: 'white',
  border: '1px solid #94a3b8',
  borderRadius: '9999px',
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  pointerEvents: 'none',
}

const DEFAULT_2D_TOP = 10
export const GRID_LINE_COLOR = '#94a3b8'

function Gridline({
  gridline,
  ndm,
  elevationRange,
}: {
  gridline: GridlineEntity
  ndm: 2 | 3
  elevationRange: [number, number]
}) {
  // Grids only ever store plan (ground-plane) coordinates — the vertical axis (Y)
  // belongs to Levels, never to a grid. In 3D a grid is a plan line drawn at
  // ground (Y=0); in 2D (no depth) a grid is a single X position drawn as a
  // vertical line spanning the model's defined levels.
  const start: [number, number, number] = ndm === 3
    ? [gridline.start[0] ?? 0, 0, gridline.start[1] ?? 0]
    : [gridline.start[0] ?? 0, elevationRange[0], 0]
  const end: [number, number, number] = ndm === 3
    ? [gridline.end[0] ?? 0, 0, gridline.end[1] ?? 0]
    : [gridline.start[0] ?? 0, elevationRange[1], 0]

  return (
    <>
      <Line points={[start, end]} color={GRID_LINE_COLOR} lineWidth={1} dashed dashScale={8} />
      <Html position={start} center style={LABEL_STYLE} zIndexRange={[10, 10]}>
        {gridline.label}
      </Html>
    </>
  )
}

export function GridlinesLayer({
  gridlines,
  showGridlines,
  ndm,
  levelElevations,
}: {
  gridlines: GridlineEntity[]
  showGridlines: boolean
  ndm: 2 | 3
  levelElevations: number[]
}) {
  if (!showGridlines) return null
  const elevationRange: [number, number] = levelElevations.length > 0
    ? [Math.min(0, ...levelElevations), Math.max(0, ...levelElevations)]
    : [0, DEFAULT_2D_TOP]
  return (
    <>
      {gridlines.map((gridline) => (
        <Gridline key={gridline.id} gridline={gridline} ndm={ndm} elevationRange={elevationRange} />
      ))}
    </>
  )
}
