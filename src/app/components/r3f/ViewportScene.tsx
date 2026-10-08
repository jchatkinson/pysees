import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box3, MOUSE, PerspectiveCamera, Vector3 } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import { toVec3 } from './utils'
import { SceneHelpers } from './SceneHelpers'
import { NodesLayer } from './Nodes'
import { ElementsLayer } from './Elements'
import { SupportsLayer } from './Supports'
import { ZeroLengthsLayer } from './ZeroLengths'
import { LoadsLayer } from './Loads'
import { GridlinesLayer } from './Gridlines'
import { LevelsLayer } from './Levels'
import { levelElevations } from '@/app/lib/levels'
import { buildSceneIndex } from './sceneIndex'
import { DisplayBuffers } from './displayBuffers'
import { ResultsDriver } from './ResultsDriver'
import { DiagramLayer } from './Diagrams'

const NODE_HIT_RADIUS_PX = 12

export type ViewportSceneRef = {
  /**
   * Select nodes touched by a canvas-relative drag rect.
   * `x1,y1` is the drag start and `x2,y2` is the drag end (not pre-sorted), so the
   * direction of the drag can be determined: left-to-right is an exclusive "window"
   * select (node marker must be fully inside the rect), right-to-left is an inclusive
   * "crossing" select (node marker only needs to overlap the rect).
   */
  selectInRect: (rect: { x1: number; y1: number; x2: number; y2: number }) => void
  /** Return the ID of the nearest node within hit radius of (x, y) in canvas pixels, or null */
  hitTestNode: (x: number, y: number) => number | null
}

export const ViewportScene = forwardRef<ViewportSceneRef, object>(function ViewportScene(_props, ref) {
  const model = useAppStore((s) => s.model)
  const gridlines = useAppStore((s) => s.gridlines)
  const levels = useAppStore((s) => s.levels)
  const hiddenLoadPatterns = useAppStore((s) => s.hiddenLoadPatterns)
  const viewportAction = useAppStore((s) => s.viewportAction)
  const viewSettings = useAppStore((s) => s.viewSettings)
  const nodePickMode = useAppStore((s) => s.nodePickMode)
  // Results are drawn on the structure, so applied loads would just clutter them (same condition ResultsDriver draws under).
  const showingResults = useAppStore((s) => s.resultsView.type !== 'none' && s.resultsView.runId !== null)
  const setSelectedNodeIds = useAppStore((s) => s.setSelectedNodeIds)
  const selectNodesFromScene = useAppStore((s) => s.selectNodesFromScene)
  const clearSceneSelection = useAppStore((s) => s.clearSceneSelection)

  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera, size } = useThree()

  const sceneIndex = useMemo(() => buildSceneIndex(model.nodes, model.elements, model.geomTransfs, model.config?.ndm === 2 ? 2 : 3), [model.nodes, model.elements, model.geomTransfs, model.config?.ndm])
  const displayBuffers = useMemo(() => new DisplayBuffers(sceneIndex), [sceneIndex])
  const fixes = useMemo(() => [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId), [model.fixes])

  // Expose selectInRect to the parent (Viewport.tsx) via ref
  useImperativeHandle(ref, () => ({
    selectInRect({ x1, y1, x2, y2 }) {
      const minX = Math.min(x1, x2)
      const maxX = Math.max(x1, x2)
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      // Left-to-right drag => exclusive "window" select (must be fully enclosed).
      // Right-to-left drag => inclusive "crossing" select (partial overlap counts).
      const exclusive = x2 >= x1
      const selected: number[] = []
      for (let i = 0; i < sceneIndex.nodeIds.length; i++) {
        const v = new Vector3().fromArray(displayBuffers.nodePositions, i * 3).project(camera)
        const sx = (v.x + 1) * 0.5 * size.width
        const sy = (-v.y + 1) * 0.5 * size.height
        const hit = exclusive
          ? sx - NODE_HIT_RADIUS_PX >= minX && sx + NODE_HIT_RADIUS_PX <= maxX
            && sy - NODE_HIT_RADIUS_PX >= minY && sy + NODE_HIT_RADIUS_PX <= maxY
          : sx + NODE_HIT_RADIUS_PX >= minX && sx - NODE_HIT_RADIUS_PX <= maxX
            && sy + NODE_HIT_RADIUS_PX >= minY && sy - NODE_HIT_RADIUS_PX <= maxY
        if (hit) selected.push(sceneIndex.nodeIds[i])
      }
      setSelectedNodeIds(selected)
      selectNodesFromScene()
    },
    hitTestNode(x, y) {
      let closestId: number | null = null
      let minDist = NODE_HIT_RADIUS_PX
      for (let i = 0; i < sceneIndex.nodeIds.length; i++) {
        const v = new Vector3().fromArray(displayBuffers.nodePositions, i * 3).project(camera)
        const sx = (v.x + 1) * 0.5 * size.width
        const sy = (-v.y + 1) * 0.5 * size.height
        const dist = Math.hypot(sx - x, sy - y)
        if (dist < minDist) { minDist = dist; closestId = sceneIndex.nodeIds[i] }
      }
      return closestId
    },
  }), [camera, size, sceneIndex, displayBuffers, setSelectedNodeIds, selectNodesFromScene])

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
      <SceneHelpers showGrid={viewSettings.showGrid} ndm={model.config?.ndm ?? 3} />
      <GridlinesLayer
        gridlines={gridlines}
        showGridlines={viewSettings.showGridlines}
        ndm={model.config?.ndm ?? 3}
        levelElevations={levelElevations(levels)}
      />
      <LevelsLayer
        levels={levels}
        gridlines={gridlines}
        ndm={model.config?.ndm ?? 3}
        showLevels={viewSettings.showLevels}
      />
      <ResultsDriver index={sceneIndex} buffers={displayBuffers} />
      <DiagramLayer buffers={displayBuffers} />
      <ElementsLayer
        index={sceneIndex}
        buffers={displayBuffers}
        showElements={viewSettings.showElements}
        showElementIds={viewSettings.showElementIds}
      />
      <NodesLayer
        index={sceneIndex}
        buffers={displayBuffers}
        showNodes={viewSettings.showNodes}
        showNodeIds={viewSettings.showNodeIds}
      />
      {viewSettings.showElements && (
        <ZeroLengthsLayer index={sceneIndex} buffers={displayBuffers} elements={model.elements} ndm={model.config?.ndm === 2 ? 2 : 3} />
      )}
      {viewSettings.showSupports && (
        <SupportsLayer fixes={fixes} nodeMap={model.nodes} />
      )}
      {!showingResults && <LoadsLayer
        patterns={[...model.patterns.values()]}
        nodeMap={model.nodes}
        elementMap={model.elements}
        geomTransfs={model.geomTransfs}
        ndm={model.config?.ndm ?? 3}
        hiddenPatterns={hiddenLoadPatterns}
        showNodal={viewSettings.showNodalLoads}
        showElement={viewSettings.showElementLoads}
        showValues={viewSettings.showLoadValues}
      />}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate
        enablePan
        enableZoom
        mouseButtons={{ LEFT: undefined, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN }}
        screenSpacePanning
        target={[0, 0, 0]}
        minDistance={0.5}
        maxDistance={500}
      />
      {/* Deselect all when clicking empty canvas space (only when not in a pick mode) */}
      <mesh
        visible={false}
        onClick={() => { if (nodePickMode === 'none') clearSceneSelection() }}
      >
        <planeGeometry args={[10000, 10000]} />
      </mesh>
    </>
  )
})
