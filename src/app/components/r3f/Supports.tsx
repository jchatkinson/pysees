import { Line } from '@react-three/drei'
import type { FixEntity, NodeEntity } from '@/app/types/model'
import { toVec3 } from './utils'
import { ScreenSize } from './ScreenSize'

/** Half-length of each support axis line, in screen pixels. */
const FIX_GLYPH_SIZE = 20

function FixGlyph({ coords, dofs }: { coords: number[]; dofs: number[] }) {
  const [x, y, z] = toVec3(coords)
  const t = FIX_GLYPH_SIZE
  return (
    <ScreenSize position={[x, y, z]}>
      {dofs.includes(1) && <Line points={[[-t, 0, 0], [t, 0, 0]]} color="#dc2626" lineWidth={2} />}
      {dofs.includes(2) && <Line points={[[0, -t, 0], [0, t, 0]]} color="#dc2626" lineWidth={2} />}
      {dofs.includes(3) && <Line points={[[0, 0, -t], [0, 0, t]]} color="#dc2626" lineWidth={2} />}
    </ScreenSize>
  )
}

export function SupportsLayer({
  fixes,
  nodeMap,
}: {
  fixes: FixEntity[]
  nodeMap: Map<number, NodeEntity>
}) {
  return (
    <>
      {fixes.map((fix) => {
        const node = nodeMap.get(fix.nodeId)
        if (!node) return null
        return <FixGlyph key={fix.nodeId} coords={node.coords} dofs={fix.dofs} />
      })}
    </>
  )
}
