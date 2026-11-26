import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box3, MOUSE, OrthographicCamera as OrthographicCameraImpl, PerspectiveCamera, Vector3 } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import { toVec3 } from './utils'
import { SceneHelpers } from './SceneHelpers'
import { FlyControls } from './FlyControls'
import { NodesLayer } from './Nodes'
import { ElementsLayer } from './Elements'
import { SupportsLayer } from './Supports'
import { ConstraintsLayer } from './Constraints'
import { FloorJoistLayer, WallDetailLayer } from './WallDetail'
import { ZeroLengthsLayer } from './ZeroLengths'
import { LoadsLayer } from './Loads'
import { batchesLoads, LABEL_LIMIT, loadGlyphCount } from './utils'
import { GridlinesLayer } from './Gridlines'
import { LevelsLayer } from './Levels'
import { UnderlaysLayer } from './Underlays'
import { levelElevations } from '@/app/lib/levels'
import { buildSceneIndex, isClosed } from './sceneIndex'
import { DisplayBuffers } from './displayBuffers'
import { ResultsDriver } from './ResultsDriver'
import { DiagramLayer } from './Diagrams'
import { dragRect, polylineInRect, type Pt } from '@/app/lib/editor/selectRect'
import { planElevation, viewSlice } from '@/app/lib/editor/viewSlice'
import { validViewMode, viewCamera } from '@/app/lib/editor/viewCamera'
import { GhostElements } from './GhostElements'
import { ReactionsLayer } from './Reactions'
import { ToolLayer } from './ToolLayer'
import { ExtrudedLayer } from './Extruded'

const NODE_HIT_RADIUS_PX = 12

export type ViewportSceneRef = {
  /**
   * Select nodes touched by a canvas-relative drag rect.
   * `x1,y1` is the drag start and `x2,y2` is the drag end (not pre-sorted), so the
   * direction of the drag can be determined: left-to-right is an exclusive "window"
   * select (node marker must be fully inside the rect), right-to-left is an inclusive
   * "crossing" select (node marker only needs to overlap the rect). Elements are selected by the same rule over their node
   * outline. `additive` (Shift/Ctrl) adds to the current selection.
   */
  selectInRect: (rect: { x1: number; y1: number; x2: number; y2: number }, additive?: boolean) => void
  /** Return the ID of the nearest node within hit radius of (x, y) in canvas pixels, or null */
  hitTestNode: (x: number, y: number) => number | null
}

export const ViewportScene = forwardRef<ViewportSceneRef, object>(function ViewportScene(_props, ref) {
  const model = useAppStore((s) => s.model)
  const gridlines = useAppStore((s) => s.gridlines)
  const levels = useAppStore((s) => s.levels)
  const underlays = useAppStore((s) => s.underlays)
  const hiddenLoadPatterns = useAppStore((s) => s.hiddenLoadPatterns)
  const viewportAction = useAppStore((s) => s.viewportAction)
  const viewSettings = useAppStore((s) => s.viewSettings)
  const nodePickMode = useAppStore((s) => s.nodePickMode)
  // Results are drawn on the structure, so applied loads would just clutter them (same condition ResultsDriver draws under).
  const showingResults = useAppStore((s) => s.resultsView.type !== 'none' && s.resultsView.runId !== null)
  const setSceneSelection = useAppStore((s) => s.setSceneSelection)
  const extruded = viewSettings.extruded && viewSettings.showElements
  // Displaced shapes stay as lines; the extruded members are the undeformed model.
  const deformedShown = useAppStore((s) => (s.resultsView.type === 'deformed' || s.resultsView.type === 'mode' || (s.resultsView.type === 'contour' && s.resultsView.contourDeformed)) && s.resultsView.runId !== null)
  const showReactions = useAppStore((s) => s.resultsView.showReactions && s.resultsView.runId !== null)

  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera, size, invalidate } = useThree()

  const ndm = model.config?.ndm === 2 ? 2 : 3
  const viewModeRaw = useAppStore((s) => s.viewMode)
  const orthographic = useAppStore((s) => s.orthographic)
  const mode = useMemo(() => validViewMode(viewModeRaw, levels, gridlines, ndm), [viewModeRaw, levels, gridlines, ndm])
  // A plan or elevation shows a slice of the model: everything downstream (drawing, picking, results) sees only that slice.
  const slice = useMemo(() => viewSlice(mode, model.nodes, model.elements, levels, gridlines, ndm), [mode, model.nodes, model.elements, levels, gridlines, ndm])
  const isolated = useAppStore((s) => s.isolated)
  // "Show selection only" narrows the view further: the isolated elements and nodes (with the elements' nodes).
  const { nodes, elements } = useMemo(() => {
    const n0 = slice?.nodes ?? model.nodes, e0 = slice?.elements ?? model.elements
    if (!isolated) return { nodes: n0, elements: e0 }
    const keepE = new Set(isolated.elements), keepN = new Set(isolated.nodes)
    const elements = new Map([...e0].filter(([id]) => keepE.has(id)))
    for (const e of elements.values()) for (const n of e.nodes) keepN.add(n)
    return { nodes: new Map([...n0].filter(([id]) => keepN.has(id))), elements }
  }, [slice, model.nodes, model.elements, isolated])
  const sceneIndex = useMemo(() => buildSceneIndex(nodes, elements, model.geomTransfs, ndm), [nodes, elements, model.geomTransfs, ndm])
  const displayBuffers = useMemo(() => new DisplayBuffers(sceneIndex), [sceneIndex])
  useEffect(() => { displayBuffers.onChange = invalidate; return () => { displayBuffers.onChange = null } }, [displayBuffers, invalidate])
  // The canvas renders on demand: redraw after any store change.
  useEffect(() => useAppStore.subscribe(() => invalidate()), [invalidate])
  const patterns = useMemo(() => [...model.patterns.values()], [model.patterns])
  // Labels the view settings ask for but this view has too many of (each is an HTML element), named next to the view.
  const resultValues = useAppStore((s) => s.resultsView.showValues && s.resultsView.runId !== null && s.resultsView.type !== 'none')
  const setHiddenLabels = useAppStore((s) => s.setHiddenLabels)
  const loadCount = useMemo(() => (viewSettings.showLoadValues ? loadGlyphCount(patterns, hiddenLoadPatterns, viewSettings.showNodalLoads) : 0), [patterns, hiddenLoadPatterns, viewSettings])
  useEffect(() => {
    const many = (n: number) => n > LABEL_LIMIT
    setHiddenLabels([
      ...(viewSettings.showNodeIds && many(sceneIndex.nodeIds.length) ? ['node IDs'] : []),
      ...(viewSettings.showElementIds && many(sceneIndex.elementIds.length) ? ['element IDs'] : []),
      ...(resultValues && (many(sceneIndex.nodeIds.length) || many(sceneIndex.elementIds.length)) ? ['result values'] : []),
      ...(!showingResults && batchesLoads(loadCount) ? ['load values'] : []),
    ])
  }, [sceneIndex, viewSettings, resultValues, showingResults, loadCount, setHiddenLabels])
  useEffect(() => () => setHiddenLabels([]), [setHiddenLabels])
  const fixes = useMemo(() => [...model.fixes.values()].filter((f) => nodes.has(f.nodeId)).sort((a, b) => a.nodeId - b.nodeId), [model.fixes, nodes])
  const isOrtho = mode.kind !== '3d' || orthographic
  const view = useMemo(() => viewCamera(mode, gridlines, ndm), [mode, gridlines, ndm])
  // Stepping between plan levels keeps the camera (same direction, pan and zoom), so the key leaves the level out.
  const viewKey = `${mode.kind === 'plan' ? 'plan' : JSON.stringify(mode)}|${isOrtho}`
  // The default camera, set here rather than by drei's <OrthographicCamera makeDefault>, which on unmount restores whichever camera
  // was the default when it rendered (after plan → 3D ortho → perspective, that was the plan camera, +Y up). The Canvas's own
  // perspective camera is kept for 3D; each orthographic view gets a fresh camera built with its own up (OrbitControls reads `up`
  // once, when it is created for a camera).
  const setThree = useThree((s) => s.set)
  const [perspective] = useState(() => camera)
  const orthoUp = (view?.up ?? (ndm === 3 ? [0, 0, 1] : [0, 1, 0])).join(',')
  const ortho = useMemo(() => {
    if (!isOrtho) return null
    const c = new OrthographicCameraImpl()
    c.up.set(...(orthoUp.split(',').map(Number) as [number, number, number]))
    return Object.assign(c, { manual: true }) // R3F leaves a manual camera's frustum to us (below)
    // viewKey: a new camera for every view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrtho, orthoUp, viewKey])
  useLayoutEffect(() => {
    if (ortho) { Object.assign(ortho, { left: size.width / -2, right: size.width / 2, top: size.height / 2, bottom: size.height / -2 }); ortho.updateProjectionMatrix() }
    setThree({ camera: ortho ?? perspective })
  }, [ortho, perspective, size, setThree])

  // Expose selectInRect to the parent (Viewport.tsx) via ref
  useImperativeHandle(ref, () => ({
    selectInRect({ x1, y1, x2, y2 }, additive) {
      // Left-to-right drag => exclusive "window" select (must be fully enclosed).
      // Right-to-left drag => inclusive "crossing" select (partial overlap counts).
      const { rect, exclusive } = dragRect(x1, y1, x2, y2)
      const screen: (Pt | null)[] = []
      for (let i = 0; i < sceneIndex.nodeIds.length; i++) {
        const v = new Vector3().fromArray(displayBuffers.nodePositions, i * 3).project(camera)
        screen.push(v.z > 1 ? null : { x: (v.x + 1) * 0.5 * size.width, y: (-v.y + 1) * 0.5 * size.height }) // behind the camera: never selected
      }
      const nodes: number[] = []
      const r = NODE_HIT_RADIUS_PX
      if (viewSettings.showNodes || nodePickMode !== 'none') sceneIndex.nodeIds.forEach((id, i) => {
        const p = screen[i]
        if (!p) return
        const hit = exclusive
          ? p.x - r >= rect.minX && p.x + r <= rect.maxX && p.y - r >= rect.minY && p.y + r <= rect.maxY
          : p.x + r >= rect.minX && p.x - r <= rect.maxX && p.y + r >= rect.minY && p.y - r <= rect.maxY
        if (hit) nodes.push(id)
      })
      const elements: number[] = []
      if (viewSettings.showElements && nodePickMode === 'none') sceneIndex.elementIds.forEach((id, e) => {
        const pts = sceneIndex.elementNodes[e].map((row) => screen[row])
        if (pts.some((p) => !p)) return
        if (polylineInRect(pts as Pt[], isClosed(sceneIndex.elementKind[e]), rect, exclusive)) elements.push(id)
      })
      setSceneSelection({ nodes, elements }, additive)
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
  }), [camera, size, sceneIndex, displayBuffers, setSceneSelection, viewSettings.showNodes, viewSettings.showElements, nodePickMode])

  // The model's extent. Models may be in mm, so the camera's clipping planes and orbit limits scale with this rather than assuming a metre-sized model.
  const bounds = useMemo(() => {
    const box = new Box3()
    for (const node of model.nodes.values()) box.expandByPoint(new Vector3(...toVec3(node.coords)))
    // An empty model (a grid template) frames its grids, up to the top level.
    if (model.nodes.size === 0) {
      const top = levelElevations(levels).at(-1) ?? 0
      for (const g of gridlines) for (const p of [g.start, g.end]) {
        box.expandByPoint(new Vector3(...toVec3(p)))
        if (top) box.expandByPoint(ndm === 3 ? new Vector3(p[0] ?? 0, p[1] ?? 0, top) : new Vector3(p[0] ?? 0, top, 0))
      }
    }
    return box
  }, [model.nodes, gridlines, levels, ndm])
  // What a plan or elevation frames: the slice, plus the grids in a plan; the whole model when the slice is empty.
  const viewBounds = useMemo(() => {
    if (!slice) return bounds
    const box = new Box3()
    for (const node of slice.nodes.values()) box.expandByPoint(new Vector3(...toVec3(node.coords)))
    if (mode.kind === 'plan') {
      const zz = planElevation(levels, mode.level)
      for (const g of gridlines) { box.expandByPoint(new Vector3(g.start[0] ?? 0, g.start[1] ?? 0, zz)); box.expandByPoint(new Vector3(g.end[0] ?? 0, g.end[1] ?? 0, zz)) }
    }
    return box.isEmpty() ? bounds : box
  }, [slice, bounds, mode, levels, gridlines])
  const radius = bounds.isEmpty() ? 2 : Math.max(bounds.getSize(new Vector3()).length(), 1) * 0.5 // bounding sphere
  const center = useMemo(() => (bounds.isEmpty() ? new Vector3() : bounds.getCenter(new Vector3())), [bounds])
  // Fly mode is a 3D perspective thing: an orthographic camera or a plan / elevation ends it.
  const flyMode = useAppStore((s) => s.flyMode)
  const flying = flyMode && !isOrtho
  useEffect(() => { if (flyMode && isOrtho) useAppStore.getState().setFlyMode(false) }, [flyMode, isOrtho])
  const maxDistance = Math.max(500, radius * 20)

  // The 3D perspective camera's last viewing direction, so the 3D orthographic view starts from the same angle.
  const lastDirection = useRef(new Vector3(10, -12, 8).normalize())

  const fit = useCallback((direction?: Vector3) => {
    const controls = controlsRef.current
    if (!controls) return
    const box = viewBounds
    const center = box.isEmpty() ? new Vector3(0, 0, 0) : box.getCenter(new Vector3())
    const dir = (direction ?? camera.position.clone().sub(controls.target)).normalize()
    if (camera instanceof PerspectiveCamera) {
      const fitDistance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.05
      const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, fitDistance))
      controls.target.copy(center)
      camera.position.copy(center.clone().add(dir.multiplyScalar(nextDistance)))
      controls.update()
      return
    }
    if (!(camera instanceof OrthographicCameraImpl)) return
    // Orthographic: stand well outside the model along the view direction, then zoom so the box's projection fills the view.
    const dist = radius * 4 + 1
    controls.target.copy(center)
    camera.position.copy(center.clone().add(dir.multiplyScalar(dist)))
    camera.near = 0
    camera.far = dist * 2 + radius * 4
    camera.lookAt(center)
    camera.updateMatrixWorld()
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    let w = 0, h = 0
    if (!box.isEmpty()) for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const zz of [box.min.z, box.max.z]) {
      const p = new Vector3(x, y, zz).sub(center)
      w = Math.max(w, Math.abs(p.dot(right)) * 2); h = Math.max(h, Math.abs(p.dot(up)) * 2)
    }
    camera.zoom = Math.max(1e-6, 0.85 * Math.min(size.width / Math.max(w, 1e-6 * radius, 1e-9), size.height / Math.max(h, 1e-6 * radius, 1e-9)))
    camera.updateProjectionMatrix()
    controls.update()
  }, [camera, viewBounds, radius, size])

  // Entering a view (or switching projection) frames it from the view's direction. The new camera arrives a render after the
  // mode changes, so wait for the camera type to match.
  const framedKey = useRef('')
  useEffect(() => {
    if (isOrtho !== camera instanceof OrthographicCameraImpl || framedKey.current === `${viewKey}|${camera.uuid}`) return
    framedKey.current = `${viewKey}|${camera.uuid}`
    fit(view?.back.clone() ?? (isOrtho ? lastDirection.current.clone() : undefined))
  }, [camera, viewKey, isOrtho, view, fit])
  // Changing plan level moves the camera and target to the new elevation, keeping the plan position and zoom.
  const planZ = mode.kind === 'plan' ? planElevation(levels, mode.level) : null
  const lastPlanZ = useRef<number | null>(null)
  useEffect(() => {
    const controls = controlsRef.current, prev = lastPlanZ.current
    lastPlanZ.current = planZ
    if (planZ === null || prev === null || prev === planZ || !controls) return
    const dz = planZ - prev
    controls.target.z += dz; camera.position.z += dz
    controls.update(); invalidate()
  }, [planZ, camera, invalidate])
  // Remember the perspective direction while it's the active camera.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !(camera instanceof PerspectiveCamera)) return
    const save = () => { lastDirection.current.copy(camera.position).sub(controls.target).normalize() }
    controls.addEventListener('end', save)
    return () => { save(); controls.removeEventListener('end', save) }
  }, [camera])

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.far = Math.max(2000, radius * 50)
    camera.near = Math.max(0.1, radius * 1e-4)
    camera.updateProjectionMatrix()
  }, [camera, radius])


  useEffect(() => {
    if (!viewportAction) return
    const controls = controlsRef.current
    if (!controls) return
    const currentOffset = camera.position.clone().sub(controls.target)
    const currentDistance = currentOffset.length() || 1
    if ((viewportAction.kind === 'zoomIn' || viewportAction.kind === 'zoomOut') && camera instanceof OrthographicCameraImpl) {
      camera.zoom *= viewportAction.kind === 'zoomIn' ? 1.2 : 1 / 1.2
      camera.updateProjectionMatrix()
      controls.update()
      return
    }
    if (viewportAction.kind === 'zoomIn' || viewportAction.kind === 'zoomOut') {
      const factor = viewportAction.kind === 'zoomIn' ? 1 / 1.2 : 1.2
      const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, currentDistance * factor))
      camera.position.copy(controls.target.clone().add(currentOffset.normalize().multiplyScalar(nextDistance)))
      controls.update()
      return
    }
    fit()
  }, [camera, viewportAction, fit])

  // The canvas renders on demand: the effects above move the camera directly, so ask for a frame after every render (declared last, it runs after them).
  useEffect(() => { invalidate() })

  return (
    <>
      <SceneHelpers showGrid={viewSettings.showGrid} ndm={model.config?.ndm ?? 3} />
      {viewSettings.showUnderlays && <UnderlaysLayer underlays={underlays} levels={levels} mode={mode} ndm={ndm} show3D={viewSettings.showUnderlays3D} />}
      <GridlinesLayer
        gridlines={gridlines}
        showGridlines={viewSettings.showGridlines}
        ndm={ndm}
        levelElevations={levelElevations(levels)}
        elevationGrid={mode.kind === 'elevation' ? mode.gridId : null}
      />
      <LevelsLayer
        levels={levels}
        gridlines={gridlines}
        ndm={ndm}
        showLevels={viewSettings.showLevels}
        only={mode.kind === 'plan' ? mode.level : undefined}
      />
      {slice && mode.kind === 'plan' && viewSettings.showStoryAbove && viewSettings.showElements && <GhostElements elements={slice.ghostElements} nodes={model.nodes} />}
      <ResultsDriver index={sceneIndex} buffers={displayBuffers} />
      <DiagramLayer buffers={displayBuffers} />
      <ElementsLayer
        index={sceneIndex}
        buffers={displayBuffers}
        showElements={viewSettings.showElements}
        showElementIds={viewSettings.showElementIds}
        extruded={extruded}
      />
      {extruded && !deformedShown && <ExtrudedLayer index={sceneIndex} elements={elements} buffers={displayBuffers} />}
      <NodesLayer
        index={sceneIndex}
        buffers={displayBuffers}
        // Hidden nodes still appear while a form waits for one to be picked.
        showNodes={viewSettings.showNodes || nodePickMode !== 'none'}
        showNodeIds={viewSettings.showNodeIds}
      />
      {viewSettings.showElements && (
        <ZeroLengthsLayer index={sceneIndex} buffers={displayBuffers} elements={model.elements} ndm={model.config?.ndm === 2 ? 2 : 3} />
      )}
      {viewSettings.showElements && (!extruded || deformedShown) && <WallDetailLayer index={sceneIndex} buffers={displayBuffers} elements={model.elements} />}
      {viewSettings.showElements && !extruded && !deformedShown && <FloorJoistLayer index={sceneIndex} elements={model.elements} model={model} />}
      <ToolLayer mode={mode} nodes={nodes} elements={elements} ndm={ndm} />
      {showReactions && <ReactionsLayer index={sceneIndex} fixes={fixes} />}
      {viewSettings.showSupports && (
        <SupportsLayer fixes={fixes} nodeMap={nodes} />
      )}
      {viewSettings.showSupports && <ConstraintsLayer constraints={model.mpConstraints} index={sceneIndex} buffers={displayBuffers} />}
      {!showingResults && <LoadsLayer
        patterns={patterns}
        nodeMap={nodes}
        elementMap={elements}
        geomTransfs={model.geomTransfs}
        sections={model.sections}
        ndm={model.config?.ndm ?? 3}
        hiddenPatterns={hiddenLoadPatterns}
        showNodal={viewSettings.showNodalLoads}
        showElement={viewSettings.showElementLoads}
        showValues={viewSettings.showLoadValues}
      />}
      {/* Plans and elevations are flat drawings: pan and zoom only. */}
      {flying && <FlyControls radius={radius} center={center} />}
      <OrbitControls
        key={`controls|${viewKey}`}
        ref={controlsRef}
        makeDefault
        enabled={!flying}
        enableRotate={mode.kind === '3d'}
        enablePan
        enableZoom
        mouseButtons={{ LEFT: undefined, MIDDLE: mode.kind === '3d' ? MOUSE.ROTATE : MOUSE.PAN, RIGHT: MOUSE.PAN }}
        screenSpacePanning
        minDistance={0.5}
        maxDistance={maxDistance}
      />
    </>
  )
})
