import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import type { Group } from 'three'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Quaternion, Vector3 } from 'three'
import type { ElementEntity, GeomTransfEntity, NodeEntity, PatternEntity, SectionEntity } from '@/app/types/model'
import { alongTotal, loadDirection, shellAreaLoads, type ShellAreaLoad } from '@/app/lib/shellLoads'
import { rampColor } from '@/app/lib/shellContour'
import { useUnits } from '@/app/lib/units/useUnits'
import { useAppStore } from '@/app/store/useAppStore'
import { memberFrame } from '@/app/lib/memberFrame'
import { eleLoadKind } from '@/app/lib/shells'
import { isShell } from '@/app/lib/commands/tables'
import { areaLoadText, batchesLoads, formatLoadValue, patternColor, toVec3 } from './utils'
import { ScreenSize } from './ScreenSize'
import { worldUnitsPerPixel } from './screenScale'

// Glyph dimensions in screen pixels.
const ARROW_LENGTH = 48
const ARROW_HEAD_LENGTH = 8
const ARROW_HEAD_WIDTH = 5

const LABEL_FONT_PX = 11

// HTML, not drei's SDF <Text>: its WebGL glyph generator was taking the viewport's WebGL context down with it.
const labelStyle = (color: string, anchor: 'middle' | 'bottom'): React.CSSProperties => ({
  fontSize: LABEL_FONT_PX, color, whiteSpace: 'nowrap', userSelect: 'none', pointerEvents: 'none', textShadow: '0 0 2px #fff, 0 0 2px #fff',
  transform: anchor === 'middle' ? 'translate(-50%, -50%)' : 'translate(-50%, calc(-100% - 4px))',
})

/** A load value label; the owner can reposition it each frame via the returned group ref. */
function LoadLabel({ text, color, groupRef }: { text: string; color: string; groupRef: React.RefObject<Group | null> }) {
  return (
    <group ref={groupRef}>
      <Html style={labelStyle(color, 'middle')} zIndexRange={[10, 10]}>{text}</Html>
    </group>
  )
}

/** DOF labels by position: 2D is X, Y, rotation about Z; 3D adds Z and the X/Y rotations. Anything past that falls back to a number. */
function dofName(i: number, ndm: number): string {
  const names = ndm === 2 ? ['Fx', 'Fy', 'Mz'] : ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz']
  return names[i] ?? `F${i + 1}`
}

function NodalLoadGlyph({ coords, values, color, showValues, ndm, label }: { coords: number[]; values: number[]; color: string; showValues: boolean; ndm: number; label?: string }) {
  const origin = new Vector3()
  const dir = new Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0)
  if (dir.length() < 1e-9) return null
  const tip = origin.clone().add(dir.normalize().multiplyScalar(ARROW_LENGTH))
  const side = dir.clone().normalize().multiplyScalar(ARROW_HEAD_LENGTH)
  // Head wings spread perpendicular to the arrow; use whichever of Z / Y is less aligned with it so a vertical load (the usual case) still gets a head.
  const up = Math.abs(dir.clone().normalize().z) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1)
  const right = new Vector3().crossVectors(side, up).normalize().multiplyScalar(ARROW_HEAD_WIDTH)
  return (
    <ScreenSize position={toVec3(coords)}>
      <Line
        points={[origin.toArray() as [number, number, number], tip.toArray() as [number, number, number]]}
        color={color}
        lineWidth={2}
      />
      <Line
        points={[tip.toArray() as [number, number, number], tip.clone().sub(side).add(right).toArray() as [number, number, number]]}
        color={color}
        lineWidth={2}
      />
      <Line
        points={[tip.toArray() as [number, number, number], tip.clone().sub(side).sub(right).toArray() as [number, number, number]]}
        color={color}
        lineWidth={2}
      />
      {showValues && (
        <Html position={tip.toArray() as [number, number, number]} style={labelStyle(color, 'bottom')} zIndexRange={[10, 10]}>
          {label ?? values.map((v, i) => (v ? `${dofName(i, ndm)}: ${formatLoadValue(v)}` : null)).filter(Boolean).join('  ')}
        </Html>
      )}
    </ScreenSize>
  )
}


interface Arrow { at: number[]; dir: number[]; color: string }



const tmpAnchor = new Vector3()

/** Screen-sized arrows as one line-segment mesh: the same shape as `NodalLoadGlyph`, rescaled on the CPU when the camera moves. */
function ArrowBatch({ arrows }: { arrows: Arrow[] }) {
  const { geometry, anchors, shape } = useMemo(() => {
    const n = arrows.length, anchors = new Float32Array(n * 3), shape = new Float32Array(n * 18), colors = new Float32Array(n * 18), color = new Color()
    arrows.forEach((a, i) => {
      const dir = new Vector3(a.dir[0] ?? 0, a.dir[1] ?? 0, a.dir[2] ?? 0).normalize()
      const tip = dir.clone().multiplyScalar(ARROW_LENGTH), side = dir.clone().multiplyScalar(ARROW_HEAD_LENGTH)
      const right = new Vector3().crossVectors(side, Math.abs(dir.z) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1)).normalize().multiplyScalar(ARROW_HEAD_WIDTH)
      ;[new Vector3(), tip, tip, tip.clone().sub(side).add(right), tip, tip.clone().sub(side).sub(right)].forEach((v, k) => v.toArray(shape, i * 18 + k * 3))
      color.set(a.color)
      for (let k = 0; k < 6; k++) color.toArray(colors, i * 18 + k * 3)
      anchors.set(toVec3(a.at), i * 3)
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(n * 18), 3).setUsage(DynamicDrawUsage))
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    return { geometry, anchors, shape }
  }, [arrows])
  useEffect(() => () => geometry.dispose(), [geometry])
  const last = useRef({ pos: new Vector3(), quat: new Quaternion(), proj: 0, zoom: 0, height: 0, geometry: null as BufferGeometry | null })
  useFrame(({ camera, size }) => {
    const l = last.current, proj = camera.projectionMatrix.elements[5]
    if (l.geometry === geometry && l.proj === proj && l.zoom === camera.zoom && l.height === size.height && l.pos.equals(camera.position) && l.quat.equals(camera.quaternion)) return
    const position = geometry.getAttribute('position') as BufferAttribute, out = position.array as Float32Array
    for (let i = 0; i < anchors.length / 3; i++) {
      const s = worldUnitsPerPixel(camera, tmpAnchor.fromArray(anchors, i * 3), size.height)
      for (let k = 0; k < 18; k++) out[i * 18 + k] = anchors[i * 3 + (k % 3)] + shape[i * 18 + k] * s
    }
    position.needsUpdate = true
    Object.assign(l, { proj, zoom: camera.zoom, height: size.height, geometry })
    l.pos.copy(camera.position); l.quat.copy(camera.quaternion)
  })
  return <lineSegments geometry={geometry} frustumCulled={false}><lineBasicMaterial vertexColors /></lineSegments>
}

const TOOLTIP_STYLE: React.CSSProperties = {
  fontSize: 11, lineHeight: '15px', whiteSpace: 'pre', color: '#0f172a', background: 'rgba(255,255,255,0.95)', border: '1px solid #cbd5e1',
  borderRadius: 3, padding: '3px 6px', pointerEvents: 'none', userSelect: 'none', transform: 'translate(10px, -50%)',
}

/** Loaded shells filled by the magnitude of their total area load (one colour per shell); hovering one shows its parts. */
function ShellLoadContour({ loads, patterns, nodeMap, elementMap }: { loads: Map<number, ShellAreaLoad>; patterns: PatternEntity[]; nodeMap: Map<number, NodeEntity>; elementMap: Map<number, ElementEntity> }) {
  const setRange = useAppStore((s) => s.setShellLoadRange)
  const units = useUnits()
  const [hover, setHover] = useState<{ tag: number; point: [number, number, number] } | null>(null)
  const { geometry, owner, range } = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const q of loads.values()) { min = Math.min(min, q.magnitude); max = Math.max(max, q.magnitude) }
    const position: number[] = [], color: number[] = [], owner: number[] = []
    for (const [tag, q] of loads) {
      const xyz = elementMap.get(tag)!.nodes.map((n) => toVec3(nodeMap.get(n)?.coords ?? []))
      const rgb = rampColor(max - min > 1e-12 * Math.max(1, max) ? (q.magnitude - min) / (max - min) : 0.5)
      for (let k = 1; k + 1 < xyz.length; k++) {
        for (const p of [xyz[0], xyz[k], xyz[k + 1]]) { position.push(...p); color.push(...rgb) }
        owner.push(tag)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(position), 3))
    geometry.setAttribute('color', new BufferAttribute(Float32Array.from(color), 3))
    geometry.computeBoundingSphere()
    return { geometry, owner, range: { min, max } }
  }, [loads, nodeMap, elementMap])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => { setRange(range); return () => setRange(null) }, [range, setRange])

  const fmt = (v: number) => areaLoadText(units, v)
  const name = (id: number) => patterns.find((p) => p.id === id)?.name ?? `Pattern ${id}`
  const q = hover && loads.get(hover.tag)
  return (
    <>
      <mesh
        geometry={geometry}
        renderOrder={1}
        onPointerMove={(e) => { if (e.faceIndex != null) setHover({ tag: owner[e.faceIndex], point: e.point.toArray() as [number, number, number] }) }}
        onPointerOut={() => setHover(null)}
      >
        <meshBasicMaterial vertexColors side={DoubleSide} transparent opacity={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      {q && hover && (
        <Html position={hover.point} style={TOOLTIP_STYLE} zIndexRange={[20, 20]}>
          {[`Shell ${hover.tag}: ${fmt(q.magnitude)} ${loadDirection(q)}`, ...q.parts.map((p) => `${name(p.patternId)} · ${p.kind === 'pressure' ? 'pressure' : 'self-weight'} ${fmt(alongTotal(p, q))}`)].join('\n')}
        </Html>
      )}
    </>
  )
}

const ARROWS_PER_ELEMENT = 5

/** Global-axis direction of a beam-uniform load, from the member's local axes (see `memberFrame`: 2D y is x turned 90° CCW; 3D follows the transformation's `vecxz`). */
function elementLoadVector(a: Vector3, b: Vector3, ndm: 2 | 3, vecxz: unknown, wx: number, wy: number, wz: number): Vector3 {
  const frame = memberFrame(a.toArray(), b.toArray(), ndm, vecxz)
  if (!frame) return new Vector3()
  const [x, y, z] = [frame.x, frame.y, frame.z].map((v) => new Vector3(...v))
  return x.multiplyScalar(wx).add(y.multiplyScalar(wy)).add(z.multiplyScalar(ndm === 3 ? wz : 0))
}

// Element-load glyph sizes are relative: the largest visible load's arrows are MAX_LEN_PX long, others scale linearly with |w|
// (floored at MIN_LEN_RATIO). One pixel scale, taken at a single shared reference point, converts that to world units each frame,
// so every glyph shares the same zoom-dependent scale factor and equal loads look equal regardless of depth.
const MAX_LEN_PX = 44
const MIN_LEN_RATIO = 0.1
const ARROW_HEAD_MAX_PX = 9
// Zoomed out, the pixel-based size would grow past the structure, so the full stack of load boxes is also capped at this fraction of the shortest member.
const MAX_STACK_FRACTION = 0.4

/**
 * Row of arrows along a member inside a rectangle: tips sit on a line parallel to the member, `offsetRatio` (in units of the
 * max arrow length) away from it against the load direction so stacked patterns don't overlap; tails sit on the opposite side.
 */
function ElementLoadGlyph({ a, b, w, ratio, offsetRatio, refPoint, maxUnit, color, label }: { a: Vector3; b: Vector3; w: Vector3; ratio: number; offsetRatio: number; refPoint: Vector3; maxUnit: number; color: string; label?: string }) {
  const ref = useRef<{ geometry: { setPositions: (p: number[]) => void } } | null>(null)
  const labelRef = useRef<Group>(null)
  const dir = useMemo(() => w.clone().normalize(), [w])
  const spread = useMemo(() => {
    // Head wings spread along the member (or in-plane perpendicular when the load is axial).
    const along = b.clone().sub(a).normalize()
    const v = along.sub(dir.clone().multiplyScalar(along.dot(dir)))
    if (v.lengthSq() < 1e-9) v.crossVectors(dir, Math.abs(dir.z) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1))
    return v.normalize()
  }, [a, b, dir])

  useFrame(({ camera, size }) => {
    const line = ref.current
    if (!line) return
    const unit = Math.min(worldUnitsPerPixel(camera, refPoint, size.height) * MAX_LEN_PX, maxUnit)
    const len = ratio * unit
    const headLen = Math.min(len * 0.3, ARROW_HEAD_MAX_PX * unit / MAX_LEN_PX)
    const tail = dir.clone().multiplyScalar(-len)
    const headBack = dir.clone().multiplyScalar(-headLen)
    const wing = spread.clone().multiplyScalar(headLen * 0.6)
    const off = dir.clone().multiplyScalar(-offsetRatio * unit)
    const p0 = a.clone().add(off), p1 = b.clone().add(off)
    const out: number[] = []
    const seg = (u: Vector3, v: Vector3) => out.push(u.x, u.y, u.z, v.x, v.y, v.z)
    seg(p0, p1); seg(p0.clone().add(tail), p1.clone().add(tail)); seg(p0, p0.clone().add(tail)); seg(p1, p1.clone().add(tail))
    for (let k = 0; k < ARROWS_PER_ELEMENT; k++) {
      const tip = p0.clone().lerp(p1, (k + 0.5) / ARROWS_PER_ELEMENT)
      seg(tip.clone().add(tail), tip)
      seg(tip, tip.clone().add(headBack).add(wing))
      seg(tip, tip.clone().add(headBack).sub(wing))
    }
    line.geometry.setPositions(out)
    // Value label: centred on the box's tail edge, nudged outward, kept a constant pixel size.
    const lbl = labelRef.current
    if (lbl) {
      lbl.position.copy(p0).lerp(p1, 0.5).add(tail).add(dir.clone().multiplyScalar(-worldUnitsPerPixel(camera, refPoint, size.height) * (LABEL_FONT_PX * 0.9)))
      lbl.scale.setScalar(worldUnitsPerPixel(camera, lbl.position, size.height))
    }
  })

  return (
    <>
      <Line ref={ref as never} segments points={Array.from({ length: (4 + ARROWS_PER_ELEMENT * 3) * 2 }, () => [0, 0, 0] as [number, number, number])} color={color} lineWidth={1.5} frustumCulled={false} />
      {label && <LoadLabel text={label} color={color} groupRef={labelRef} />}
    </>
  )
}

/** Renders nodal `load` and uniform `eleLoad` assignments from the patterns not hidden (Model entities, not a command history position). */
export function LoadsLayer({
  patterns,
  nodeMap,
  elementMap,
  geomTransfs,
  sections,
  ndm,
  hiddenPatterns,
  showNodal,
  showElement,
  showValues,
}: {
  patterns: PatternEntity[]
  nodeMap: Map<number, NodeEntity>
  elementMap: Map<number, ElementEntity>
  geomTransfs: Map<number, GeomTransfEntity>
  sections: Map<number, SectionEntity>
  ndm: number
  hiddenPatterns: number[]
  showNodal: boolean
  showElement: boolean
  showValues: boolean
}) {
  const ids = useMemo(() => patterns.map((p) => p.id).sort((x, y) => x - y), [patterns])
  const visible = useMemo(() => patterns.filter((p) => !hiddenPatterns.includes(p.id)), [patterns, hiddenPatterns])

  const elementLoads = showElement ? visible.flatMap((p) => p.children.flatMap((c) => {
    if (c.kind !== 'eleLoad' || eleLoadKind(c.args) !== 'beam') return []
    const { eleTags, wx, wy, wz } = c.args as { eleTags: number[]; wx?: number; wy: number; wz: number }
    return (eleTags ?? []).flatMap((tag) => {
      const ele = elementMap.get(tag)
      const n1 = ele && nodeMap.get(ele.nodes[0])
      const n2 = ele && nodeMap.get(ele.nodes[1])
      if (!n1 || !n2) return []
      const a = new Vector3(...toVec3(n1.coords)), b = new Vector3(...toVec3(n2.coords))
      if (a.distanceToSquared(b) < 1e-18) return []
      const w = elementLoadVector(a, b, ndm === 2 ? 2 : 3, geomTransfs.get(Number(ele.args.transfTag))?.args.vecxz, Number(wx) || 0, Number(wy) || 0, Number(wz) || 0)
      if (w.length() < 1e-12) return []
      return [{ pid: p.id, key: `${p.id}-${tag}-${wx}-${wy}-${wz}`, a, b, w, label: [['wx', wx], ['wy', wy], ['wz', wz]].filter(([, v]) => Number(v)).map(([n, v]) => `${n}: ${formatLoadValue(Number(v))}`).join('  '), color: patternColor(ids, p.id) }]
    })
  })) : []
  const maxW = elementLoads.reduce((m, l) => Math.max(m, l.w.length()), 0)
  const ratioFor = (l: { w: Vector3 }) => Math.max(MIN_LEN_RATIO, l.w.length() / maxW)
  // Shared reference point for the single pixel scale: centroid of the loaded members.
  const refPoint = new Vector3()
  for (const l of elementLoads) refPoint.add(l.a).add(l.b)
  if (elementLoads.length) refPoint.divideScalar(elementLoads.length * 2)
  // Stack patterns outward from the member in id order so their boxes don't overlap: each pattern starts right past the longest arrow of the ones before it.
  const offsetByPattern = new Map<number, number>()
  let stacked = 0
  for (const pid of ids) {
    const mine = elementLoads.filter((l) => l.pid === pid)
    if (!mine.length) continue
    offsetByPattern.set(pid, stacked)
    stacked += Math.max(...mine.map(ratioFor))
  }

  let minLen = Infinity
  for (const e of elementMap.values()) {
    if (isShell(e.eleType)) continue
    const n1 = nodeMap.get(e.nodes[0]), n2 = nodeMap.get(e.nodes[1])
    if (n1 && n2) minLen = Math.min(minLen, new Vector3(...toVec3(n1.coords)).distanceTo(new Vector3(...toVec3(n2.coords))))
  }
  const maxUnit = Number.isFinite(minLen) && stacked > 0 ? (MAX_STACK_FRACTION * minLen) / stacked : Infinity

  const nodalLoads = useMemo(() => showNodal ? visible.flatMap((p) => p.children.flatMap((c, idx) => {
    if (c.kind !== 'load') return []
    const args = c.args as { nodeTag: number; values: number[] }
    const node = nodeMap.get(args.nodeTag)
    return node ? [{ key: `load-${p.id}-${idx}`, at: node.coords, values: args.values, dir: args.values.slice(0, 3), color: patternColor(ids, p.id) }] : []
  })) : [], [visible, ids, nodeMap, showNodal])
  const batched = useMemo(() => batchesLoads(nodalLoads.length) ? nodalLoads.filter((a) => Math.hypot(...a.dir) > 1e-9) : null, [nodalLoads])
  // Shell pressure and self-weight: the shells coloured by their total area load.
  const shellLoads = useMemo(() => (showElement ? shellAreaLoads(visible, [], elementMap, nodeMap, sections) : new Map<number, ShellAreaLoad>()), [visible, elementMap, nodeMap, sections, showElement])

  return (
    <>
      {shellLoads.size > 0 && <ShellLoadContour loads={shellLoads} patterns={patterns} nodeMap={nodeMap} elementMap={elementMap} />}
      {batched ? <ArrowBatch arrows={batched} /> : nodalLoads.map((l) => <NodalLoadGlyph key={l.key} coords={l.at} values={l.values} color={l.color} showValues={showValues} ndm={ndm} />)}
      {elementLoads.map((l, i) => <ElementLoadGlyph key={`${l.key}-${i}`} a={l.a} b={l.b} w={l.w} ratio={ratioFor(l)} offsetRatio={offsetByPattern.get(l.pid) ?? 0} refPoint={refPoint} maxUnit={maxUnit} color={l.color} label={showValues ? l.label : undefined} />)}
    </>
  )
}
