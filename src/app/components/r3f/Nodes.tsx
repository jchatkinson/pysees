import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from 'three'
import type { Intersection, Points, Raycaster } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import type { DisplayBuffers, NodeLabel } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'
import { LABEL_LIMIT } from './utils'
import { SceneLabels, type SceneLabelStyle } from './SceneLabels'

/** Node marker (a small ✕) size in screen pixels, and when selected. */
const NODE_PX = 7
const NODE_SELECTED_PX = 11
/** How close (screen pixels) a click must land to pick a node. */
export const NODE_HIT_RADIUS_PX = 8

const COLOR_DEFAULT = new Color('#334155')
const COLOR_SELECTED = new Color('#2563eb')

// A ✕ in each point sprite: the two diagonals of the point's square, about 1.5 px wide at any size.
const VERTEX = `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
varying float vSize;
uniform float pixelRatio;
void main() {
  vColor = color;
  vSize = size * pixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = vSize;
}`
const FRAGMENT = `
varying vec3 vColor;
varying float vSize;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  if (min(abs(p.x - p.y), abs(p.x + p.y)) * vSize > 1.1) discard;
  gl_FragColor = vec4(vColor, 1.0);
}`

const tmpPos = new Vector3()
const tmpNdc = new Vector3()

/** All nodes as one `Points` draw: a fixed-size ✕ drawn by the GPU, so nothing is rescaled per frame. Picking is by screen distance. */
function NodePoints({
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
  const { gl, invalidate } = useThree()
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('size', new BufferAttribute(new Float32Array(count), 1))
    return g
  }, [count])
  const material = useMemo(() => new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { pixelRatio: { value: 1 } } }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const colors = geometry.getAttribute('color') as BufferAttribute, sizes = geometry.getAttribute('size') as BufferAttribute
    for (let i = 0; i < count; i++) {
      const on = selected.has(index.nodeIds[i])
      ;(on ? COLOR_SELECTED : COLOR_DEFAULT).toArray(colors.array, i * 3)
      sizes.array[i] = on ? NODE_SELECTED_PX : NODE_PX
    }
    colors.needsUpdate = true; sizes.needsUpdate = true
    invalidate()
  }, [geometry, index, count, selected, invalidate])

  const seen = useRef(-1)
  useFrame(() => {
    material.uniforms.pixelRatio.value = gl.getPixelRatio()
    if (seen.current === buffers.version) return
    const position = geometry.getAttribute('position') as BufferAttribute
    ;(position.array as Float32Array).set(buffers.nodePositions)
    position.needsUpdate = true
    geometry.computeBoundingSphere()
    seen.current = buffers.version
  })
  useEffect(() => { seen.current = -1 }, [geometry])

  // Screen-space picking: the nearest node within NODE_HIT_RADIUS_PX of the pointer (`Points`' own raycast works in world units).
  const raycast = useMemo(() => function (this: Points, raycaster: Raycaster, intersects: Intersection[]) {
    const camera = raycaster.camera
    if (!camera) return
    const { width, height } = gl.domElement.getBoundingClientRect()
    const pointer = tmpNdc.copy(raycaster.ray.origin).add(raycaster.ray.direction).project(camera)
    const px = (pointer.x + 1) * 0.5 * width, py = (1 - pointer.y) * 0.5 * height
    let best = -1, bestDist = NODE_HIT_RADIUS_PX
    const positions = buffers.nodePositions
    for (let i = 0; i < count; i++) {
      const v = tmpPos.fromArray(positions, i * 3).project(camera)
      if (v.z > 1) continue
      const d = Math.hypot((v.x + 1) * 0.5 * width - px, (1 - v.y) * 0.5 * height - py)
      if (d < bestDist) { bestDist = d; best = i }
    }
    if (best < 0) return
    const point = new Vector3().fromArray(positions, best * 3)
    // Slightly in front of its true distance, so a node wins over the member it sits on.
    intersects.push({ distance: raycaster.ray.origin.distanceTo(point) * 0.999, point, index: best, object: this })
  }, [gl, buffers, count])

  return (
    <points
      geometry={geometry}
      material={material}
      raycast={raycast}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation()
        if (e.index === undefined) return
        onToggle(index.nodeIds[e.index], e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey)
      }}
    />
  )
}

// One instanced draw each (see `SceneLabels`), not an <Html> per node. Lifted so a node inside an extruded member still shows its label.
const ID_BOX = { fill: '#ffffff', stroke: '#cbd5e1', padX: 3, height: 14, radius: 2 }
const ID_STYLE: SceneLabelStyle = { size: 9, color: '#475569', offset: [4, -16], box: ID_BOX, lift: 32 }
const VALUE_STYLE: SceneLabelStyle = { ...ID_STYLE, offset: [8, 6], box: { ...ID_BOX, height: 12, fill: 'rgba(255,255,255,0.9)' } }

/** Per-node displacement text for the deformed view, refreshed when ResultsDriver publishes a new step. */
function NodeValueLabels({ buffers }: { buffers: DisplayBuffers }) {
  const [shown, setShown] = useState<{ version: number; labels: NodeLabel[] }>({ version: -1, labels: [] })
  useFrame(() => { if (shown.version !== buffers.version) setShown({ version: buffers.version, labels: buffers.active ? buffers.nodeLabels : [] }) })
  const labels = useMemo(() => shown.labels.map((l) => ({ position: l.position as [number, number, number], text: l.text })), [shown])
  return <SceneLabels labels={labels} style={VALUE_STYLE} />
}

function NodeLabels({ index }: { index: SceneIndex }) {
  const labels = useMemo(() => index.nodeIds.map((id, i) => ({ position: [index.nodeCoords[i * 3], index.nodeCoords[i * 3 + 1], index.nodeCoords[i * 3 + 2]] as [number, number, number], text: `N${id}` })), [index])
  return <SceneLabels labels={labels} style={ID_STYLE} />
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
  const selectNodesFromScene = useAppStore((s) => s.selectNodesFromScene)
  const nodePickMode = useAppStore((s) => s.nodePickMode)
  const setPendingNodePick = useAppStore((s) => s.setPendingNodePick)

  const showDisplacements = useAppStore((s) => s.resultsView.showValues && s.resultsView.type === 'deformed' && s.resultsView.runId !== null)
  const selected = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])

  const handleToggle = (id: number, shiftKey: boolean) => {
    const seq = nodePickMode === 'vec-sequential'
    toggleNodeInSelection(id, shiftKey || seq)
    selectNodesFromScene()
    if (seq) setPendingNodePick(id)
  }

  return (
    <>
      {showNodes && index.nodeIds.length > 0 && <NodePoints index={index} buffers={buffers} selected={selected} onToggle={handleToggle} />}
      {showNodeIds && index.nodeIds.length <= LABEL_LIMIT && <NodeLabels index={index} />}
      {showDisplacements && index.nodeIds.length <= LABEL_LIMIT && <NodeValueLabels buffers={buffers} />}
    </>
  )
}
