import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Color, DynamicDrawUsage, Matrix4, Quaternion, Sphere, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import { worldUnitsPerPixel } from './screenScale'
import type { DisplayBuffers, NodeLabel } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'

/** Node marker radius in screen pixels. */
const NODE_RADIUS_PX = 6

const COLOR_DEFAULT = new Color('#111827')
const COLOR_SELECTED = new Color('#2563eb')

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

const tmpMatrix = new Matrix4()
const tmpPos = new Vector3()

/** All nodes as one InstancedMesh; each instance is rescaled so the marker stays NODE_RADIUS_PX on screen. */
function NodeInstances({
  index,
  buffers,
  selected,
  onToggle,
}: {
  index: SceneIndex
  buffers: DisplayBuffers
  selected: Set<number>
  onToggle: (id: number, additive: boolean) => void
}) {
  const count = index.nodeIds.length
  const ref = useRef<InstancedMesh>(null)
  const last = useRef({ pos: new Vector3(), quat: new Quaternion(), proj: 0, zoom: 0, height: 0, version: -1, dirty: true })

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    // Instances are rescaled/moved every frame, so the cached bounding sphere (used by the
    // raycaster) would go stale; use a generously large one around the model instead.
    const center = new Vector3()
    for (let i = 0; i < count; i++) center.add(tmpPos.fromArray(index.nodeCoords, i * 3))
    if (count) center.divideScalar(count)
    let radius = 0
    for (let i = 0; i < count; i++) radius = Math.max(radius, center.distanceTo(tmpPos.fromArray(index.nodeCoords, i * 3)))
    mesh.boundingSphere = new Sphere(center, radius * 4 + 1000)
    mesh.frustumCulled = false
    last.current.dirty = true
  }, [index, count])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < count; i++) mesh.setColorAt(i, selected.has(index.nodeIds[i]) ? COLOR_SELECTED : COLOR_DEFAULT)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [index, count, selected])

  useFrame(({ camera, size }) => {
    const mesh = ref.current
    if (!mesh) return
    const l = last.current
    const proj = camera.projectionMatrix.elements[5]
    if (!l.dirty && l.version === buffers.version && l.proj === proj && l.zoom === camera.zoom && l.height === size.height
      && l.pos.equals(camera.position) && l.quat.equals(camera.quaternion)) return
    for (let i = 0; i < count; i++) {
      tmpPos.fromArray(buffers.nodePositions, i * 3)
      const s = worldUnitsPerPixel(camera, tmpPos, size.height) * NODE_RADIUS_PX
      mesh.setMatrixAt(i, tmpMatrix.makeScale(s, s, s).setPosition(tmpPos))
    }
    mesh.instanceMatrix.needsUpdate = true
    l.pos.copy(camera.position)
    l.quat.copy(camera.quaternion)
    l.proj = proj
    l.zoom = camera.zoom
    l.height = size.height
    l.version = buffers.version
    l.dirty = false
  })

  return (
    <instancedMesh
      key={count}
      ref={ref}
      args={[undefined, undefined, count]}
      onClick={(e) => {
        e.stopPropagation()
        if (e.instanceId === undefined) return
        onToggle(index.nodeIds[e.instanceId], e.nativeEvent.shiftKey)
      }}
    >
      <sphereGeometry args={[1, 20, 20]} />
      <meshStandardMaterial />
    </instancedMesh>
  )
}

const VALUE_LABEL_STYLE: React.CSSProperties = {
  ...LABEL_STYLE, lineHeight: '12px', whiteSpace: 'pre', transform: 'translate(8px, 6px)', background: 'rgba(255,255,255,0.9)',
}

/** Per-node displacement text for the deformed view, refreshed when ResultsDriver publishes a new step. */
function NodeValueLabels({ buffers }: { buffers: DisplayBuffers }) {
  const [shown, setShown] = useState<{ version: number; labels: NodeLabel[] }>({ version: -1, labels: [] })
  useFrame(() => { if (shown.version !== buffers.version) setShown({ version: buffers.version, labels: buffers.active ? buffers.nodeLabels : [] }) })
  return (
    <>
      {shown.labels.map((l, i) => <Html key={i} position={l.position} style={VALUE_LABEL_STYLE} zIndexRange={[10, 10]}>{l.text}</Html>)}
    </>
  )
}

function NodeLabels({ index }: { index: SceneIndex }) {
  return (
    <>
      {index.nodeIds.map((id, i) => (
        <Html
          key={id}
          position={[index.nodeCoords[i * 3], index.nodeCoords[i * 3 + 1], index.nodeCoords[i * 3 + 2]]}
          style={LABEL_STYLE}
          zIndexRange={[10, 10]}
        >
          N{id}
        </Html>
      ))}
    </>
  )
}

export function NodesLayer({
  index,
  buffers,
  showNodes,
  showNodeIds,
}: {
  index: SceneIndex
  buffers: DisplayBuffers
  showNodes: boolean
  showNodeIds: boolean
}) {
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds)
  const toggleNodeInSelection = useAppStore((s) => s.toggleNodeInSelection)
  const nodePickMode = useAppStore((s) => s.nodePickMode)
  const setPendingNodePick = useAppStore((s) => s.setPendingNodePick)

  const showDisplacements = useAppStore((s) => s.resultsView.showValues && s.resultsView.type === 'deformed' && s.resultsView.runId !== null)
  const selected = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])

  const handleToggle = (id: number, shiftKey: boolean) => {
    const seq = nodePickMode === 'vec-sequential'
    toggleNodeInSelection(id, shiftKey || seq)
    if (seq) setPendingNodePick(id)
  }

  return (
    <>
      {showNodes && index.nodeIds.length > 0 && <NodeInstances index={index} buffers={buffers} selected={selected} onToggle={handleToggle} />}
      {showNodeIds && <NodeLabels index={index} />}
      {showDisplacements && <NodeValueLabels buffers={buffers} />}
    </>
  )
}
