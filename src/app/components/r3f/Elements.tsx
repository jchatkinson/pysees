import { useEffect, useMemo } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'
import { useAppStore } from '@/app/store/useAppStore'
import { BufferLines } from './BufferLines'
import type { DisplayBuffers } from './displayBuffers'
import { fillSegmentPositions, type SceneIndex } from './sceneIndex'
import { ShellSurfaces } from './Shells'

const ELEMENT_COLOR = 0x4b5563
const ELEMENT_LINE_WIDTH_PX = 2
const GHOST_COLOR = 0x9ca3af
const GHOST_LINE_WIDTH_PX = 1
const DEFORMED_COLOR = 0x2563eb
const SELECTED_COLOR = '#2563eb'
const SELECTED_LINE_WIDTH_PX = 4

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

/** Every element as one batched fat-line draw call; `ghost` draws the thin undeformed reference under a displaced shape. */
function ElementLines({ index, ghost }: { index: SceneIndex; ghost: boolean }) {
  const size = useThree((s) => s.size)
  const selectElementFromScene = useAppStore((s) => s.selectElementFromScene)

  const material = useMemo(() => new LineMaterial({ color: ghost ? GHOST_COLOR : ELEMENT_COLOR, linewidth: ghost ? GHOST_LINE_WIDTH_PX : ELEMENT_LINE_WIDTH_PX }), [ghost])
  const { lines, geometry } = useMemo(() => {
    const positions = new Float32Array(index.segmentCount * 6)
    fillSegmentPositions(index, index.nodeCoords, positions)
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    const lines = new LineSegments2(geometry, material)
    // Positions will be rewritten per step, so the static bounding sphere can't be trusted.
    lines.frustumCulled = false
    return { lines, geometry }
  }, [index, material])

  useEffect(() => { material.resolution.set(size.width, size.height) }, [material, size])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  // Clicking a member selects it (the ghost reference under a deformed shape isn't pickable). The hit is a segment index; map it back to its element.
  const onClick = ghost ? undefined : (e: ThreeEvent<MouseEvent>) => {
    const segment = e.index ?? e.faceIndex
    if (segment == null) return
    e.stopPropagation()
    const starts = index.elementSegmentStart
    let lo = 0, hi = index.elementIds.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= segment) lo = mid; else hi = mid - 1 }
    selectElementFromScene(index.elementIds[lo])
  }

  return <primitive object={lines} onClick={onClick} />
}

/** The element chosen in the model list or the scene, drawn over the model lines. */
function SelectedElement({ index }: { index: SceneIndex }) {
  const id = useAppStore((s) => (s.selectedModelEntity?.kind === 'element' ? s.selectedModelEntity.id : null))
  const e = id === null ? -1 : index.elementIds.indexOf(id)
  if (e < 0) return null
  const rows = index.elementKind[e] === 'shell' ? [...index.elementNodes[e], index.elementNodes[e][0]] : index.elementNodes[e]
  const points = rows.map((r) => [index.nodeCoords[r * 3], index.nodeCoords[r * 3 + 1], index.nodeCoords[r * 3 + 2]] as [number, number, number])
  return <Line points={points} color={SELECTED_COLOR} lineWidth={SELECTED_LINE_WIDTH_PX} />
}

function ElementLabels({ index }: { index: SceneIndex }) {
  return (
    <>
      {index.elementIds.map((id, j) => {
        const rows = index.elementNodes[j]
        const mid: [number, number, number] = [0, 0, 0]
        for (const r of rows) for (let k = 0; k < 3; k++) mid[k] += index.nodeCoords[r * 3 + k] / rows.length
        return (
          <Html key={id} position={mid} center style={LABEL_STYLE} zIndexRange={[10, 10]}>
            E{id}
          </Html>
        )
      })}
    </>
  )
}

export function ElementsLayer({
  index,
  buffers,
  showElements,
  showElementIds,
}: {
  index: SceneIndex
  buffers: DisplayBuffers
  showElements: boolean
  showElementIds: boolean
}) {
  const deformedMode = useAppStore((s) => (s.resultsView.type === 'deformed' || s.resultsView.type === 'mode' || (s.resultsView.type === 'contour' && s.resultsView.contourDeformed)) && s.resultsView.runId !== null)
  const showUndeformed = useAppStore((s) => s.resultsView.showUndeformed)
  const hasSegments = index.segmentCount > 0
  return (
    <>
      {showElements && <ShellSurfaces index={index} buffers={buffers} />}
      {showElements && hasSegments && (!deformedMode || showUndeformed) && <ElementLines index={index} ghost={deformedMode} />}
      {deformedMode && hasSegments && <BufferLines positions={buffers.deformedSegments} color={DEFORMED_COLOR} widthPx={ELEMENT_LINE_WIDTH_PX} isActive={() => buffers.active} getVersion={() => buffers.version} />}
      {showElements && !deformedMode && <SelectedElement index={index} />}
      {showElementIds && <ElementLabels index={index} />}
    </>
  )
}
