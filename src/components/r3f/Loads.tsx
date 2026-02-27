import { Line } from '@react-three/drei'
import { Vector3 } from 'three'
import type { LoadState, NodeState } from '@/types/model'
import { toVec3 } from './utils'

function NodalLoadGlyph({ coords, values }: { coords: number[]; values: number[] }) {
  const origin = new Vector3(...toVec3(coords))
  const dir = new Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0)
  if (dir.length() < 1e-9) return null
  const tip = origin.clone().add(dir.normalize().multiplyScalar(1.2))
  const side = dir.clone().normalize().multiplyScalar(0.2)
  const up = new Vector3(0, 0, 1)
  const right = new Vector3().crossVectors(side, up).normalize().multiplyScalar(0.12)
  return (
    <group>
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
    </group>
  )
}

export function LoadsLayer({
  loads,
  nodeMap,
}: {
  loads: LoadState[]
  nodeMap: Map<number, NodeState>
}) {
  return (
    <>
      {loads.map((load, idx) => {
        const node = nodeMap.get(load.nodeId)
        if (!node) return null
        return <NodalLoadGlyph key={`load-${idx}`} coords={node.coords} values={load.values} />
      })}
    </>
  )
}
