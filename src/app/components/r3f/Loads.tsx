import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Vector3 } from 'three'
import type { ElementEntity, NodeEntity, PatternEntity } from '@/app/types/model'
import { patternColor, toVec3 } from './utils'
import { ScreenSize } from './ScreenSize'
import { worldUnitsPerPixel } from './screenScale'

// Glyph dimensions in screen pixels.
const ARROW_LENGTH = 48
const ARROW_HEAD_LENGTH = 8
const ARROW_HEAD_WIDTH = 5

function NodalLoadGlyph({ coords, values, color }: { coords: number[]; values: number[]; color: string }) {
  const origin = new Vector3()
  const dir = new Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0)
  if (dir.length() < 1e-9) return null
  const tip = origin.clone().add(dir.normalize().multiplyScalar(ARROW_LENGTH))
  const side = dir.clone().normalize().multiplyScalar(ARROW_HEAD_LENGTH)
  const up = new Vector3(0, 0, 1)
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
    </ScreenSize>
  )
}

const ARROWS_PER_ELEMENT = 5

/** Global-axis direction of a beam-uniform load: local y/z axes follow the usual OpenSees defaults (2D: y is x rotated 90° CCW in the XY plane; 3D: y is global Y projected normal to the member, z = x × y). */
function elementLoadVector(a: Vector3, b: Vector3, ndm: number, wy: number, wz: number): Vector3 {
  const x = b.clone().sub(a).normalize()
  if (ndm === 2) return new Vector3(-x.y, x.x, 0).multiplyScalar(wy)
  const up = Math.abs(x.y) > 0.999 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const y = up.sub(x.clone().multiplyScalar(up.dot(x))).normalize()
  const z = new Vector3().crossVectors(x, y)
  return y.multiplyScalar(wy).add(z.multiplyScalar(wz))
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
function ElementLoadGlyph({ a, b, w, ratio, offsetRatio, refPoint, maxUnit, color }: { a: Vector3; b: Vector3; w: Vector3; ratio: number; offsetRatio: number; refPoint: Vector3; maxUnit: number; color: string }) {
  const ref = useRef<{ geometry: { setPositions: (p: number[]) => void } } | null>(null)
  const dir = useMemo(() => w.clone().normalize(), [w])
  const spread = useMemo(() => {
    // Head wings spread along the member (or in-plane perpendicular when the load is axial).
    const along = b.clone().sub(a).normalize()
    const v = along.sub(dir.clone().multiplyScalar(along.dot(dir)))
    if (v.lengthSq() < 1e-9) v.set(dir.y, -dir.x, 0)
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
  })

  return <Line ref={ref as never} segments points={Array.from({ length: (4 + ARROWS_PER_ELEMENT * 3) * 2 }, () => [0, 0, 0] as [number, number, number])} color={color} lineWidth={1.5} frustumCulled={false} />
}

/** Renders nodal `load` and uniform `eleLoad` assignments from the patterns not hidden (Model entities, not a command history position). */
export function LoadsLayer({
  patterns,
  nodeMap,
  elementMap,
  ndm,
  hiddenPatterns,
  showNodal,
  showElement,
}: {
  patterns: PatternEntity[]
  nodeMap: Map<number, NodeEntity>
  elementMap: Map<number, ElementEntity>
  ndm: number
  hiddenPatterns: number[]
  showNodal: boolean
  showElement: boolean
}) {
  const ids = patterns.map((p) => p.id).sort((x, y) => x - y)
  const visible = patterns.filter((p) => !hiddenPatterns.includes(p.id))

  const elementLoads = showElement ? visible.flatMap((p) => p.children.flatMap((c) => {
    if (c.kind !== 'eleLoad') return []
    const { eleTags, wy, wz } = c.args as { eleTags: number[]; wy: number; wz: number }
    return (eleTags ?? []).flatMap((tag) => {
      const ele = elementMap.get(tag)
      const n1 = ele && nodeMap.get(ele.nodes[0])
      const n2 = ele && nodeMap.get(ele.nodes[1])
      if (!n1 || !n2) return []
      const a = new Vector3(...toVec3(n1.coords)), b = new Vector3(...toVec3(n2.coords))
      if (a.distanceToSquared(b) < 1e-18) return []
      const w = elementLoadVector(a, b, ndm, Number(wy) || 0, Number(wz) || 0)
      if (w.length() < 1e-12) return []
      return [{ pid: p.id, key: `${p.id}-${tag}-${wy}-${wz}`, a, b, w, color: patternColor(ids, p.id) }]
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
    const n1 = nodeMap.get(e.nodes[0]), n2 = nodeMap.get(e.nodes[1])
    if (n1 && n2) minLen = Math.min(minLen, new Vector3(...toVec3(n1.coords)).distanceTo(new Vector3(...toVec3(n2.coords))))
  }
  const maxUnit = Number.isFinite(minLen) && stacked > 0 ? (MAX_STACK_FRACTION * minLen) / stacked : Infinity

  return (
    <>
      {showNodal && visible.flatMap((p) => p.children.map((c, idx) => ({ p, c, idx })).filter(({ c }) => c.kind === 'load')).map(({ p, c, idx }) => {
        const args = c.args as { nodeTag: number; values: number[] }
        const node = nodeMap.get(args.nodeTag)
        if (!node) return null
        return <NodalLoadGlyph key={`load-${p.id}-${idx}`} coords={node.coords} values={args.values} color={patternColor(ids, p.id)} />
      })}
      {elementLoads.map((l, i) => <ElementLoadGlyph key={`${l.key}-${i}`} a={l.a} b={l.b} w={l.w} ratio={ratioFor(l)} offsetRatio={offsetByPattern.get(l.pid) ?? 0} refPoint={refPoint} maxUnit={maxUnit} color={l.color} />)}
    </>
  )
}
