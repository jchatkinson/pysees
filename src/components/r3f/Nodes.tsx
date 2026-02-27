import { Html } from '@react-three/drei'
import type { NodeState } from '@/types/model'
import { toVec3 } from './utils'

const NODE_RADIUS = 0.12

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  color: '#475569',
  background: 'white',
  border: '0.5px solid #cbd5e1',
  borderRadius: 2,
  padding: '0 3px',
  lineHeight: '14px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  pointerEvents: 'none',
  // offset up-right so the chip doesn't cover the sphere
  transform: 'translate(4px, -16px)',
}

function Node({
  node,
  selected,
  showId,
  onSelect,
}: {
  node: NodeState
  selected: boolean
  showId: boolean
  onSelect: (id: number) => void
}) {
  const pos = toVec3(node.coords)
  return (
    <group position={pos}>
      <mesh onClick={() => onSelect(node.id)}>
        <sphereGeometry args={[NODE_RADIUS, 20, 20]} />
        <meshStandardMaterial color={selected ? '#2563eb' : '#111827'} />
      </mesh>
      {showId && (
        <Html style={LABEL_STYLE} zIndexRange={[10, 10]}>
          N{node.id}
        </Html>
      )}
    </group>
  )
}

export function NodesLayer({
  nodes,
  showNodes,
  showNodeIds,
  selectedNodeId,
  onSelect,
}: {
  nodes: NodeState[]
  showNodes: boolean
  showNodeIds: boolean
  selectedNodeId: number | null
  onSelect: (id: number) => void
}) {
  if (!showNodes && !showNodeIds) return null
  return (
    <>
      {nodes.map((node) => (
        <Node
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          showId={showNodeIds}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}
