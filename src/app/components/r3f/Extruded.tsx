import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Path, Shape, ShapeUtils, Vector2 } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import type { ElementEntity, Model } from '@/app/types/model'
import type { SectionOutline } from '@/app/lib/sections/types'
import { memberShape, shellThickness } from '@/app/lib/editor/memberShape'
import { framingUnit, wallFraming, type FramingPart } from '@/app/lib/editor/wallFraming'
import { studWallArgs } from '@/app/lib/studWalls'
import { guessFraming, lumberScale } from '@/app/lib/lumber'
import { floorFramingBoxes } from '@/app/lib/floors'
import type { SceneIndex } from './sceneIndex'
import type { DisplayBuffers } from './displayBuffers'
import type { WallMemberForce } from '@/app/lib/studBuilding'

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

const WOOD: Record<FramingPart, Color> = { stud: new Color('#d9bf91'), plate: new Color('#cfb07c'), header: new Color('#c49a5e'), rim: new Color('#c49a5e'), subfloor: new Color('#b98f55'), sheathing: new Color('#c8a463') }

/** The extruded light-frame layers, in buffer order: whether see-through, and a depth bias pushing it back. Coincident faces (joist tops
 * level with a wall's floor-zone rim, the subfloor slab with a wall's subfloor strip, joist ends against floor rims) then resolve the same
 * way every frame (walls, then floor rims, joists, subfloor) instead of flickering; lines on the floor plane stay over the subfloor. */
const TENSION = new Color('#2563eb'), COMPRESSION = new Color('#dc2626'), NEUTRAL = new Color('#e7e5e4'), FRAME_GREY = new Color('#d6d3d1')

const LAYERS = [{ see: false, bias: 0 }, { see: true, bias: 0 }, { see: false, bias: 1 }, { see: false, bias: 2 }, { see: true, bias: 3 }]

/** Stud walls as their framing (and joist floors: joists, rims, subfloor) (studs, plates, jacks, headers, sills, rim and subfloor) with the sheathing as a see-through skin over
 * one face; one merged mesh for the lumber and one for the sheathing, picked per triangle. */
function StudWalls({ index, elements, model, selected, onPick, buffers }: { index: SceneIndex; elements: Map<number, ElementEntity>; model: Model; selected: Set<number>; onPick: (id: number, additive: boolean) => void; buffers?: DisplayBuffers }) {
  // The step's member forces, when the results show them (ResultsDriver publishes them into the display buffers).
  const [members, setMembers] = useState<Map<number, WallMemberForce[]> | null>(null)
  const seen = useRef(-1)
  useFrame(() => { if (buffers && seen.current !== buffers.wallMembersVersion) { seen.current = buffers.wallMembersVersion; setMembers(buffers.wallMembers) } })
  const meshes = useMemo(() => {
    const buffer = () => ({ pos: [] as number[], col: [] as number[], owner: [] as number[] })
    // One buffer per layer (see LAYERS): floor pieces share faces with the walls and with each other, so each layer gets its own depth bias.
    const solid = buffer(), skin = buffer(), floorRim = buffer(), floorJoist = buffer(), floorSkin = buffer()
    // A box [x0, x1, y0, y1, z0, z1] in a frame `v`, as 12 triangles (two per face) owned by element `id`.
    // `col` may vary by corner (corner index i: bit 0 = x1, bit 1 = y1, bit 2 = z1), e.g. a member coloured bottom to top by its force.
    const box = (buf: typeof solid, v: (x: number, y: number, z: number) => number[], [x0, x1, y0, y1, z0, z1]: number[], col: Color | ((i: number) => Color), id: number) => {
      const q = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => v(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0))
      const cc = (i: number) => (typeof col === 'function' ? col(i) : col)
      for (const [a, b, d, g] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) {
        buf.pos.push(...q[a], ...q[b], ...q[d], ...q[a], ...q[d], ...q[g])
        for (const i of [a, b, d, a, d, g]) { const c = cc(i); buf.col.push(c.r, c.g, c.b) }
        buf.owner.push(id, id)
      }
    }
    // Members mode (axial results): framing members coloured by their force on a diverging scale, the rest neutral.
    const peak = members ? Math.max(1e-30, ...[...members.values()].flat().flatMap((m) => [Math.abs(m.bottom), Math.abs(m.top)]).filter(Number.isFinite)) : 0
    const heat = (v: number) => (Number.isFinite(v) ? NEUTRAL.clone().lerp(v >= 0 ? TENSION : COMPRESSION, Math.min(1, Math.abs(v) / peak)) : NEUTRAL)
    const c = index.nodeCoords, at = (r: number) => [c[r * 3], c[r * 3 + 1], c[r * 3 + 2]]
    index.elementIds.forEach((id, e) => {
      if (index.elementKind[e] !== 'wall') return
      const el = elements.get(id), rows = el?.nodes.slice(0, 4).map((n) => index.nodeIndex.get(n))
      if (!el || !rows || rows.some((r) => r === undefined)) return
      const [p0, p1, , p3] = (rows as number[]).map(at)
      const dx = p1.map((v, k) => v - p0[k]), dy = p3.map((v, k) => v - p0[k]), L = Math.hypot(...dx), H = Math.hypot(...dy)
      if (!(L > 0 && H > 0)) return
      const ex = dx.map((v) => v / L), ey = dy.map((v) => v / H)
      const ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]]
      const { layout, framing } = studWallArgs(el.args)
      const units = model.config?.units
      const pick = selected.has(id)
      const v = (x: number, y: number, z: number) => [0, 1, 2].map((k) => p0[k] + ex[k] * x + ey[k] * y + ez[k] * z)
      for (const f of wallFraming(layout, L, H, framingUnit(units?.length, H), framing ?? guessFraming(layout, lumberScale(units, H), !units || !['in', 'ft'].includes(units.length)))) {
        const forces = members?.get(id)
        const m = forces && f.member && forces.find((x) => x.kind === f.member!.kind && Math.abs(x.x - f.member!.x) <= 1e-6 * L)
        const col = !forces ? (pick ? SELECTED : WOOD[f.part]) : m ? (i: number) => heat(i & 2 ? m.top : m.bottom) : f.part === 'sheathing' ? WOOD.sheathing : FRAME_GREY
        box(f.part === 'sheathing' ? skin : solid, v, [f.x0, f.x1, f.y0, f.y1, f.z0, f.z1], col, id)
      }
    })
    // Joist floors: joists and rims in the floor's own frame (s along the joists, t across, z up), the subfloor a see-through slab.
    index.elementIds.forEach((id, e) => {
      if (index.elementKind[e] !== 'floor') return
      const el = elements.get(id), fr = el && floorFramingBoxes(model, el)
      if (!fr) return
      const pick = selected.has(id)
      const v = (s: number, t: number, z: number) => [s * fr.d[0] + t * fr.n[0], s * fr.d[1] + t * fr.n[1], z]
      for (const b of fr.boxes) box(b.part === 'rim' ? floorRim : floorJoist, v, [b.s0, b.s1, b.t0, b.t1, b.z0, b.z1], pick ? SELECTED : WOOD[b.part === 'rim' ? 'rim' : 'plate'], id)
      const { outline, z0, z1 } = fr.slab, col = pick ? SELECTED : WOOD.subfloor
      const tri = (p: number[], q: number[], r: number[]) => { floorSkin.pos.push(...p, ...q, ...r); for (let k = 0; k < 3; k++) floorSkin.col.push(col.r, col.g, col.b); floorSkin.owner.push(id) }
      for (const [i, j, k] of ShapeUtils.triangulateShape(outline.map(([x, y]) => new Vector2(x, y)), [])) for (const z of [z0, z1]) tri([...outline[i], z], [...outline[j], z], [...outline[k], z])
      outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length]; tri([...p, z0], [...q, z0], [...q, z1]); tri([...p, z0], [...q, z1], [...p, z1]) })
    })
    return [solid, skin, floorRim, floorJoist, floorSkin].map(({ pos, col, owner }) => {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
      g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
      g.computeVertexNormals()
      return { geometry: g, owner }
    })
  }, [index, elements, model, selected, members])
  const materials = useMemo(() => LAYERS.map(({ see, bias }) => new MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, ...(see ? { side: DoubleSide, transparent: true, opacity: 0.35, depthWrite: false } : {}), ...(bias ? { polygonOffset: true, polygonOffsetFactor: bias, polygonOffsetUnits: bias } : {}),
  })), [])
  useEffect(() => () => { for (const m of meshes) m.geometry.dispose() }, [meshes])
  useEffect(() => () => { for (const m of materials) m.dispose() }, [materials])
  return (
    <>
      {meshes.map(({ geometry, owner }, i) => owner.length > 0 && (
        <mesh key={i} geometry={geometry} material={materials[i]} renderOrder={i} onClick={(e) => { if (e.faceIndex == null) return; e.stopPropagation(); onPick(owner[e.faceIndex], e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) }} />
      ))}
    </>
  )
}

/**
 * The extruded view: members drawn at their section's real outline (fiber sections) or a nominal one (an elastic member's equivalent
 * rectangle, a truss's square of its area), swept along their local axes, level members hanging from their axis (top face on it); shells at their thickness; stud walls as their framing. Fiber detail stays in the properties panel.
 */
export function ExtrudedLayer({ index, elements, buffers }: { index: SceneIndex; elements: Map<number, ElementEntity>; buffers?: DisplayBuffers }) {
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
      // A level member (beam, joist) hangs from its axis: drawn with its top face on the node line, as framing sits under the floor it
      // carries (drawing only: the analysis has no offset). Columns and braces stay centred.
      const up = model.config?.ndm === 2 ? 1 : 2, level = Math.abs(f[up]) < 0.05
      const top = level ? Math.max(...s.outline.outer.map((p) => p.y * f[3 + up] + p.z * f[6 + up])) : 0, o = [a[0], a[1], a[2]]
      o[up] -= top
      // Columns of the matrix: section y → local y, section z → local z, prism Z (0..1) → local x scaled to the length.
      const m = new Matrix4().set(f[3], f[6], f[0] * len, o[0], f[4], f[7], f[1] * len, o[1], f[5], f[8], f[2] * len, o[2], 0, 0, 0, 1)
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
      <StudWalls index={index} elements={elements} model={model} selected={selected} onPick={selectElementFromScene} buffers={buffers} />
    </>
  )
}
