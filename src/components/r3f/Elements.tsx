import { Html, Line } from '@react-three/drei'
import type { ElementState, NodeState } from '@/types/model'
import { toVec3 } from './utils'

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  color: '#334155',
  background: 'white',
  border: '0.5px solid #cbd5e1',
  borderRadius: 2,
  padding: '0 3px',
  lineHeight: '14px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  pointerEvents: 'none',
}

function midpoint(points: [number, number, number][]): [number, number, number] {
  const sum = points.reduce(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] as [number, number, number],
    [0, 0, 0] as [number, number, number],
  )
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length]
}

function Element({
  element,
  nodeMap,
  showLine,
  showId,
}: {
  element: ElementState
  nodeMap: Map<number, NodeState>
  showLine: boolean
  showId: boolean
}) {
  const points = element.nodes
    .map((id) => nodeMap.get(id))
    .filter((n): n is NodeState => Boolean(n))
    .map((n) => toVec3(n.coords))

  if (points.length < 2) return null
  const mid = midpoint(points)

  return (
    <>
      {showLine && <Line points={points} color="#4b5563" lineWidth={2} />}
      {showId && (
        <Html position={mid} center style={LABEL_STYLE} zIndexRange={[10, 10]}>
          E{element.id}
        </Html>
      )}
    </>
  )
}

export function ElementsLayer({
  elements,
  nodeMap,
  showElements,
  showElementIds,
}: {
  elements: ElementState[]
  nodeMap: Map<number, NodeState>
  showElements: boolean
  showElementIds: boolean
}) {
  if (!showElements && !showElementIds) return null
  return (
    <>
      {elements.map((element) => (
        <Element
          key={element.id}
          element={element}
          nodeMap={nodeMap}
          showLine={showElements}
          showId={showElementIds}
        />
      ))}
    </>
  )
}
