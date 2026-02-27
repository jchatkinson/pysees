import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { useAppStore, useModelState } from '@/store/useAppStore'
import { toVec3 } from './utils'
import { SceneHelpers } from './SceneHelpers'
import { NodesLayer } from './Nodes'
import { ElementsLayer } from './Elements'
import { SupportsLayer } from './Supports'
import { LoadsLayer } from './Loads'

export function ViewportScene() {
  const model = useModelState()
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const viewportAction = useAppStore((s) => s.viewportAction)
  const viewSettings = useAppStore((s) => s.viewSettings)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()

  const nodes = useMemo(() => [...model.nodes.values()].sort((a, b) => a.id - b.id), [model.nodes])
  const elements = useMemo(() => [...model.elements.values()].sort((a, b) => a.id - b.id), [model.elements])
  const fixes = useMemo(() => [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId), [model.fixes])

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
    const size = hasGeometry ? box.getSize(new Vector3()) : new Vector3(4, 4, 4)
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.5
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
        selectedNodeId={selectedNodeId}
        onSelect={setSelectedNodeId}
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
        enableRotate
        enablePan
        enableZoom
        screenSpacePanning
        target={[0, 0, 0]}
        minDistance={0.5}
        maxDistance={500}
      />
    </>
  )
}
