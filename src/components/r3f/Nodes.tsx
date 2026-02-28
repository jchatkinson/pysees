import { Html } from '@react-three/drei'
import type { NodeState } from '@/types/model'
import { useAppStore } from '@/store/useAppStore'
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
  transform: 'translate(4px, -16px)',
}

function Node({
  node,
  selected,
  showId,
  onToggle,
}: {
  node: NodeState
  selected: boolean
  showId: boolean
  onToggle: (id: number, additive: boolean) => void
}) {
  const pos = toVec3(node.coords)
  return (
    <group position={pos}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onToggle(node.id, e.nativeEvent.shiftKey)
        }}
      >
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
}: {
  nodes: NodeState[]
  showNodes: boolean
  showNodeIds: boolean
}) {
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds)
  const toggleNodeInSelection = useAppStore((s) => s.toggleNodeInSelection)
  const nodePickMode = useAppStore((s) => s.nodePickMode)
  const setPendingNodePick = useAppStore((s) => s.setPendingNodePick)

  const selectedSet = new Set(selectedNodeIds)

  const handleToggle = (id: number, shiftKey: boolean) => {
    const seq = nodePickMode === 'vec-sequential'
    toggleNodeInSelection(id, shiftKey || seq)
    if (seq) setPendingNodePick(id)
  }

  if (!showNodes && !showNodeIds) return null
  return (
    <>
      {nodes.map((node) => (
        <Node
          key={node.id}
          node={node}
          selected={selectedSet.has(node.id)}
          showId={showNodeIds}
          onToggle={handleToggle}
        />
      ))}
    </>
  )
}
