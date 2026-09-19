import { Html, Line } from '@react-three/drei'
import type { GridlineEntity } from '@/app/types/gridlines'
import { toVec3 } from './utils'

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

function Gridline({ gridline }: { gridline: GridlineEntity }) {
  const start = toVec3(gridline.start)
  const end = toVec3(gridline.end)
  return (
    <>
      <Line points={[start, end]} color="#94a3b8" lineWidth={1} dashed dashScale={8} />
      <Html position={start} center style={LABEL_STYLE} zIndexRange={[10, 10]}>
        {gridline.label}
      </Html>
      <Html position={end} center style={LABEL_STYLE} zIndexRange={[10, 10]}>
        {gridline.label}
      </Html>
    </>
  )
}

export function GridlinesLayer({
  gridlines,
  showGridlines,
}: {
  gridlines: GridlineEntity[]
  showGridlines: boolean
}) {
  if (!showGridlines) return null
  return (
    <>
      {gridlines.map((gridline) => (
        <Gridline key={gridline.id} gridline={gridline} />
      ))}
    </>
  )
}
