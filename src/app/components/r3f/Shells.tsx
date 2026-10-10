import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import type { DisplayBuffers } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'

const SURFACE_COLOR = 0x93c5fd
const SURFACE_OPACITY = 0.28
const CONTOUR_OPACITY = 0.9
const SELECTED_COLOR = 0x2563eb
const SELECTED_OPACITY = 0.45

/** Triangle fan of every shell's polygon, over the shared node rows; `owner[t]` is the index-element row of triangle `t`. */
function triangulate(index: SceneIndex): { triangles: number[]; owner: number[] } {
  const triangles: number[] = []
  const owner: number[] = []
  index.elementNodes.forEach((rows, e) => {
    if (index.elementKind[e] !== 'shell') return
    for (let k = 1; k + 1 < rows.length; k++) {
      triangles.push(rows[0], rows[k], rows[k + 1])
      owner.push(e)
    }
  })
  return { triangles, owner }
}

/**
 * Shell elements as translucent filled polygons over the model lines. The surface shares the node positions in `buffers`, so it
 * follows the displaced shape (amplified by the display scale) with no per-element work; clicking it selects the shell.
 */
export function ShellSurfaces({ index, buffers }: { index: SceneIndex; buffers: DisplayBuffers }) {
  const selectElementFromScene = useAppStore((s) => s.selectElementFromScene)
  const selectedId = useAppStore((s) => (s.selectedModelEntity?.kind === 'element' ? s.selectedModelEntity.id : null))
  const seen = useRef(-1)
  const ref = useRef<Mesh>(null)

  const { geometry, owner, position } = useMemo(() => {
    const { triangles, owner } = triangulate(index)
    const position = new BufferAttribute(new Float32Array(buffers.nodePositions), 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', position)
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(buffers.contourColors), 3))
    geometry.setIndex(triangles)
    return { geometry, owner, position }
  }, [index, buffers])
  const material = useMemo(() => new MeshBasicMaterial({ color: SURFACE_COLOR, opacity: SURFACE_OPACITY, transparent: true, side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), [])
  const selectedMaterial = useMemo(() => new MeshBasicMaterial({ color: SELECTED_COLOR, opacity: SELECTED_OPACITY, transparent: true, side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), [])
  // The selected shell is its own mesh over the same vertex data, so it follows the displaced positions too.
  const selectedGeometry = useMemo(() => {
    const row = selectedId === null ? -1 : index.elementIds.indexOf(selectedId)
    if (row < 0 || index.elementKind[row] !== 'shell') return null
    const g = new BufferGeometry()
    g.setAttribute('position', position)
    const rows = index.elementNodes[row]
    const triangles: number[] = []
    for (let k = 1; k + 1 < rows.length; k++) triangles.push(rows[0], rows[k], rows[k + 1])
    g.setIndex(triangles)
    return g
  }, [index, position, selectedId])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh || seen.current === buffers.version) return
    // The selected mesh shares this attribute, so one upload moves both.
    const attribute = mesh.geometry.getAttribute('position') as BufferAttribute
    ;(attribute.array as Float32Array).set(buffers.nodePositions)
    attribute.needsUpdate = true
    // A contour paints the surface by node colour, nearly opaque; otherwise it is the plain translucent fill.
    const colors = mesh.geometry.getAttribute('color') as BufferAttribute
    if (buffers.contourActive) { (colors.array as Float32Array).set(buffers.contourColors); colors.needsUpdate = true }
    const mat = mesh.material as MeshBasicMaterial
    if (mat.vertexColors !== buffers.contourActive) { mat.vertexColors = buffers.contourActive; mat.needsUpdate = true }
    mat.opacity = buffers.contourActive ? CONTOUR_OPACITY : SURFACE_OPACITY
    mat.color.set(buffers.contourActive ? 0xffffff : SURFACE_COLOR)
    seen.current = buffers.version
  })
  useEffect(() => { seen.current = -1 }, [geometry])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => selectedGeometry?.dispose(), [selectedGeometry])
  useEffect(() => () => { material.dispose(); selectedMaterial.dispose() }, [material, selectedMaterial])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.faceIndex == null) return
    e.stopPropagation()
    selectElementFromScene(index.elementIds[owner[e.faceIndex]])
  }

  if (owner.length === 0) return null
  return (
    <>
      <mesh ref={ref} geometry={geometry} material={material} onClick={onClick} frustumCulled={false} renderOrder={-1} />
      {selectedGeometry && <mesh geometry={selectedGeometry} material={selectedMaterial} frustumCulled={false} renderOrder={-1} raycast={noRaycast} />}
    </>
  )
}

const noRaycast: Mesh['raycast'] = () => {}
