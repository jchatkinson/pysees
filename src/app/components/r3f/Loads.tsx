import { Line } from '@react-three/drei'
import { Vector3 } from 'three'
import type { NodeEntity, PatternEntity } from '@/app/types/model'
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
