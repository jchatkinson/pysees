import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box3, MOUSE, PerspectiveCamera, Vector3 } from 'three'
import { useAppStore, useModelState } from '@/store/useAppStore'
import { toVec3 } from './utils'
import { SceneHelpers } from './SceneHelpers'
import { NodesLayer } from './Nodes'
import { ElementsLayer } from './Elements'
import { SupportsLayer } from './Supports'
import { LoadsLayer } from './Loads'

const NODE_HIT_RADIUS_PX = 12

export type ViewportSceneRef = {
  /** Select all nodes whose projected screen position falls inside the given canvas-relative rect */
  selectInRect: (rect: { x1: number; y1: number; x2: number; y2: number }) => void
  /** Return the ID of the nearest node within hit radius of (x, y) in canvas pixels, or null */
  hitTestNode: (x: number, y: number) => number | null
}

export const ViewportScene = forwardRef<ViewportSceneRef, { shiftRotateEnabled?: boolean }>(function ViewportScene(props, ref) {
  const { shiftRotateEnabled = false } = props
  const model = useModelState()
  const viewportAction = useAppStore((s) => s.viewportAction)
  const viewSettings = useAppStore((s) => s.viewSettings)
  const nodePickMode = useAppStore((s) => s.nodePickMode)
  const setSelectedNodeIds = useAppStore((s) => s.setSelectedNodeIds)

  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera, size } = useThree()

  const nodes = useMemo(() => [...model.nodes.values()].sort((a, b) => a.id - b.id), [model.nodes])
  const elements = useMemo(() => [...model.elements.values()].sort((a, b) => a.id - b.id), [model.elements])
  const fixes = useMemo(() => [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId), [model.fixes])

  // Expose selectInRect to the parent (Viewport.tsx) via ref
  useImperativeHandle(ref, () => ({
    selectInRect({ x1, y1, x2, y2 }) {
      const minX = Math.min(x1, x2)
      const maxX = Math.max(x1, x2)
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      const selected: number[] = []
      for (const node of model.nodes.values()) {
        const v = new Vector3(...toVec3(node.coords)).project(camera)
        const sx = (v.x + 1) * 0.5 * size.width
        const sy = (-v.y + 1) * 0.5 * size.height
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selected.push(node.id)
      }
      setSelectedNodeIds(selected)
    },
    hitTestNode(x, y) {
      let closestId: number | null = null
      let minDist = NODE_HIT_RADIUS_PX
      for (const node of model.nodes.values()) {
        const v = new Vector3(...toVec3(node.coords)).project(camera)
        const sx = (v.x + 1) * 0.5 * size.width
        const sy = (-v.y + 1) * 0.5 * size.height
        const dist = Math.hypot(sx - x, sy - y)
        if (dist < minDist) { minDist = dist; closestId = node.id }
      }
      return closestId
    },
  }), [camera, size, model.nodes, setSelectedNodeIds])

  useEffect(() => {
    if (!viewportAction) return
    const controls = controlsRef.current
    if (!controls) return
    const currentOffset = camera.position.clone().sub(controls.target)
    const currentDistance = currentOffset.length() || 1

    if (viewportAction.kind === 'zoomIn' || viewportAction.kind === 'zoomOut') {
      const factor = viewportAction.kind === 'zoomIn' ? 1 / 1.2 : 1.2
      const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, currentDistance * factor))
      camera.position.copy(controls.target.clone().add(currentOffset.normalize().multiplyScalar(nextDistance)))
      controls.update()
      return
    }

    if (!(camera instanceof PerspectiveCamera)) return
    const box = new Box3()
    for (const node of model.nodes.values()) box.expandByPoint(new Vector3(...toVec3(node.coords)))
    const hasGeometry = box.min.x <= box.max.x && box.min.y <= box.max.y && box.min.z <= box.max.z
    const center = hasGeometry ? box.getCenter(new Vector3()) : new Vector3(0, 0, 0)
    const sizeVec = hasGeometry ? box.getSize(new Vector3()) : new Vector3(4, 4, 4)
    const radius = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1) * 0.5
    const fov = (camera.fov * Math.PI) / 180
    const fitDistance = (radius / Math.tan(fov / 2)) * 1.25
    const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, fitDistance))
    const direction = currentOffset.normalize()
    controls.target.copy(center)
    camera.position.copy(center.clone().add(direction.multiplyScalar(nextDistance)))
    controls.update()
  }, [camera, model.nodes, viewportAction])

  return (
    <>
      <SceneHelpers showGrid={viewSettings.showGrid} />
      <ElementsLayer
        elements={elements}
        nodeMap={model.nodes}
        showElements={viewSettings.showElements}
        showElementIds={viewSettings.showElementIds}
      />
      <NodesLayer
        nodes={nodes}
        showNodes={viewSettings.showNodes}
        showNodeIds={viewSettings.showNodeIds}
      />
      {viewSettings.showSupports && (
        <SupportsLayer fixes={fixes} nodeMap={model.nodes} />
      )}
      {viewSettings.showNodalLoads && (
        <LoadsLayer loads={model.loads} nodeMap={model.nodes} />
      )}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate={shiftRotateEnabled}
        enablePan={shiftRotateEnabled}
        enableZoom
        mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
        screenSpacePanning
        target={[0, 0, 0]}
        minDistance={0.5}
        maxDistance={500}
      />
      {/* Deselect all when clicking empty canvas space (only when not in a pick mode) */}
      <mesh
        visible={false}
        onClick={() => { if (nodePickMode === 'none') setSelectedNodeIds([]) }}
      >
        <planeGeometry args={[10000, 10000]} />
      </mesh>
    </>
  )
})
