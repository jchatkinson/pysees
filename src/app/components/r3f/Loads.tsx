import { Line } from '@react-three/drei'
import { Vector3 } from 'three'
import type { NodeEntity, PatternEntity } from '@/app/types/model'
import { toVec3 } from './utils'
import { ScreenSize } from './ScreenSize'

// Glyph dimensions in screen pixels.
const ARROW_LENGTH = 48
const ARROW_HEAD_LENGTH = 8
const ARROW_HEAD_WIDTH = 5

function NodalLoadGlyph({ coords, values }: { coords: number[]; values: number[] }) {
  const origin = new Vector3()
  const dir = new Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0)
  if (dir.length() < 1e-9) return null
  const tip = origin.clone().add(dir.normalize().multiplyScalar(ARROW_LENGTH))
  const side = dir.clone().normalize().multiplyScalar(ARROW_HEAD_LENGTH)
  const up = new Vector3(0, 0, 1)
  const right = new Vector3().crossVectors(side, up).normalize().multiplyScalar(ARROW_HEAD_WIDTH)
  return (
    <ScreenSize position={toVec3(coords)}>
      <Line
        points={[origin.toArray() as [number, number, number], tip.toArray() as [number, number, number]]}
        color="#2563eb"
        lineWidth={2}
      />
      <Line
        points={[tip.toArray() as [number, number, number], tip.clone().sub(side).add(right).toArray() as [number, number, number]]}
        color="#2563eb"
        lineWidth={2}
      />
      <Line
        points={[tip.toArray() as [number, number, number], tip.clone().sub(side).sub(right).toArray() as [number, number, number]]}
        color="#2563eb"
        lineWidth={2}
      />
    </ScreenSize>
  )
}

/** Renders nodal `load` assignments from every currently-defined pattern (Model entities, not a command history position). */
export function LoadsLayer({
  patterns,
  nodeMap,
}: {
  patterns: PatternEntity[]
  nodeMap: Map<number, NodeEntity>
}) {
  const loads = patterns.flatMap((p) => p.children.filter((c) => c.kind === 'load'))
  return (
    <>
      {loads.map((load, idx) => {
        const args = load.args as { nodeTag: number; values: number[] }
        const node = nodeMap.get(args.nodeTag)
        if (!node) return null
        return <NodalLoadGlyph key={`load-${idx}`} coords={node.coords} values={args.values} />
      })}
    </>
  )
}
