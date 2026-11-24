import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Path, Shape } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import type { ElementEntity, Model } from '@/app/types/model'
import type { SectionOutline } from '@/app/lib/sections/types'
import { memberShape, shellThickness } from '@/app/lib/editor/memberShape'
import type { SceneIndex } from './sceneIndex'

const REAL = new Color('#94a3b8')
const NOMINAL = new Color('#cbd5e1')
const SELECTED = new Color('#2563eb')
const SHELL = '#cbd5e1'

/** A unit-length prism of the outline: the shape in the XY plane (section y, z), swept 0..1 along Z (the member axis). */
function prism(outline: SectionOutline): BufferGeometry {
  const shape = new Shape(outline.outer.map((p) => ({ x: p.y, y: p.z }) as never))
  for (const h of outline.holes) shape.holes.push(new Path(h.map((p) => ({ x: p.y, y: p.z }) as never)))
  const g = new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 })
  g.computeVertexNormals()
  return g
}

interface Group { key: string; geometry: BufferGeometry; ids: number[]; matrices: Matrix4[]; nominal: boolean }

/** One instanced mesh per section shape: each member is the unit prism scaled to its length and turned into its local axes. */
function MemberGroup({ group, material, selected, onPick }: { group: Group; material: MeshStandardMaterial; selected: Set<number>; onPick: (id: number, additive: boolean) => void }) {
  const mesh = useMemo(() => {
    const m = new InstancedMesh(group.geometry, material, group.ids.length)
    group.matrices.forEach((mat, i) => { m.setMatrixAt(i, mat); m.setColorAt(i, group.nominal ? NOMINAL : REAL) }) // colours exist before the first draw, so the shader uses them
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    return m
  }, [group, material])
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    group.ids.forEach((id, i) => m.setColorAt(i, selected.has(id) ? SELECTED : group.nominal ? NOMINAL : REAL))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    invalidate()
  }, [mesh, group, selected, invalidate])
  useEffect(() => () => mesh.dispose(), [mesh])
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId == null) return
    e.stopPropagation()
    onPick(group.ids[e.instanceId], e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey)
  }
  return <primitive ref={ref} object={mesh} onClick={onClick} />
}

/** Shells as slabs of their section's thickness about the mid-surface (top, bottom and edge faces), one merged mesh. */
function ShellSlabs({ index, elements, model, selected, onPick }: { index: SceneIndex; elements: Map<number, ElementEntity>; model: Model; selected: Set<number>; onPick: (id: number, additive: boolean) => void }) {
  const { geometry, owner } = useMemo(() => {
    const pos: number[] = [], col: number[] = [], owner: number[] = []
    const base = new Color(SHELL)
    index.elementIds.forEach((id, e) => {
      if (index.elementKind[e] !== 'shell') return
      const h = shellThickness(model, elements.get(id)!)
      if (!h) return
      const n = index.elementFrames.subarray(e * 9 + 6, e * 9 + 9)
      const rows = index.elementNodes[e]
      const at = (r: number, s: number) => [0, 1, 2].map((k) => index.nodeCoords[r * 3 + k] + s * n[k] * h / 2)
      const c = selected.has(id) ? SELECTED : base
      const tri = (a: number[], b: number[], d: number[]) => { pos.push(...a, ...b, ...d); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b); owner.push(id) }
      for (const s of [1, -1]) for (let k = 1; k + 1 < rows.length; k++) tri(at(rows[0], s), at(rows[k], s), at(rows[k + 1], s))
      for (let k = 0; k < rows.length; k++) {
        const a = rows[k], b = rows[(k + 1) % rows.length]
        tri(at(a, 1), at(b, 1), at(b, -1)); tri(at(a, 1), at(b, -1), at(a, -1))
      }
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
    g.computeVertexNormals()
    return { geometry: g, owner }
  }, [index, elements, model, selected])
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, transparent: true, opacity: 0.85, roughness: 0.9 }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  if (owner.length === 0) return null
  return <mesh geometry={geometry} material={material} onClick={(e) => { if (e.faceIndex == null) return; e.stopPropagation(); onPick(owner[e.faceIndex], e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) }} />
}

/**
 * The extruded view: members drawn at their section's real outline (fiber sections) or a nominal square of their area (elastic members,
 * trusses), swept along their local axes; shells at their thickness. Fiber detail stays in the properties panel.
 */
export function ExtrudedLayer({ index, elements }: { index: SceneIndex; elements: Map<number, ElementEntity> }) {
  const model = useAppStore((s) => s.model)
  const selectedIds = useAppStore((s) => s.selectedElementIds)
  const selectElementFromScene = useAppStore((s) => s.selectElementFromScene)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const groups = useMemo(() => {
    const byKey = new Map<string, Group>()
    const geometries = new Map<string, BufferGeometry>()
    index.elementIds.forEach((id, e) => {
      const kind = index.elementKind[e]
      if (kind !== 'beam' && kind !== 'truss') return
      const el = elements.get(id)
      const s = el && memberShape(model, el)
      if (!s) return
      const rows = index.elementNodes[e]
      const a = index.nodeCoords.subarray(rows[0] * 3, rows[0] * 3 + 3), b = index.nodeCoords.subarray(rows[rows.length - 1] * 3, rows[rows.length - 1] * 3 + 3)
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const f = index.elementFrames.subarray(e * 9, e * 9 + 9)
      if (!(len > 0) || (f[0] === 0 && f[1] === 0 && f[2] === 0)) return
      // Columns of the matrix: section y → local y, section z → local z, prism Z (0..1) → local x scaled to the length.
      const m = new Matrix4().set(f[3], f[6], f[0] * len, a[0], f[4], f[7], f[1] * len, a[1], f[5], f[8], f[2] * len, a[2], 0, 0, 0, 1)
      let g = byKey.get(s.key)
      if (!g) {
        let geometry = geometries.get(s.key)
        if (!geometry) { geometry = prism(s.outline); geometries.set(s.key, geometry) }
        g = { key: s.key, geometry, ids: [], matrices: [], nominal: s.nominal }
        byKey.set(s.key, g)
      }
      g.ids.push(id); g.matrices.push(m)
    })
    return [...byKey.values()]
  }, [index, elements, model])
  useEffect(() => () => { for (const g of groups) g.geometry.dispose() }, [groups])
  const material = useMemo(() => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0 }), [])
  useEffect(() => () => material.dispose(), [material])

  return (
    <>
      {groups.map((g) => <MemberGroup key={g.key} group={g} material={material} selected={selected} onPick={selectElementFromScene} />)}
      <ShellSlabs index={index} elements={elements} model={model} selected={selected} onPick={selectElementFromScene} />
    </>
  )
}
