import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from 'three'
import type { ElementEntity, GeomTransfEntity, NodeEntity, PatternEntity, SectionEntity } from '@/app/types/model'
import { alongTotal, loadDirection, shellAreaLoads, type ShellAreaLoad } from '@/app/lib/shellLoads'
import { rampColor } from '@/app/lib/shellContour'
import { useUnits } from '@/app/lib/units/useUnits'
import { useAppStore } from '@/app/store/useAppStore'
import { memberFrame } from '@/app/lib/memberFrame'
import { eleLoadKind, wallLoadSpec } from '@/app/lib/shells'
import { isShell } from '@/app/lib/commands/tables'
import { areaLoadText, batchesLoads, formatLoadValue, patternColor, toVec3 } from './utils'
import { worldUnitsPerPixel } from './screenScale'
import { useCameraChange, useSegmentLines } from './batchHooks'
import { ScreenLabels, type ScreenLabel } from './ScreenLabels'

/**
 * Applied loads, batched: per pattern colour, all nodal arrows are one fat-line draw and all member-load boxes another. Positions are
 * linear in a screen-to-world scale, so each draw keeps a fixed part and a per-scale part and is rewritten only when the camera moves.
 */

// Nodal arrow sizes in screen pixels.
const ARROW_LENGTH = 48
const ARROW_HEAD_LENGTH = 8
const ARROW_HEAD_WIDTH = 5

// Element-load glyph sizes are relative: the largest visible load's arrows are MAX_LEN_PX long, others scale linearly with |w|
// (floored at MIN_LEN_RATIO). One pixel scale, taken at a single shared reference point, converts that to world units,
// so every glyph shares the same zoom-dependent scale factor and equal loads look equal regardless of depth.
const MAX_LEN_PX = 44
const MIN_LEN_RATIO = 0.1
const ARROW_HEAD_MAX_PX = 9
// Zoomed out, the pixel-based size would grow past the structure, so the full stack of load boxes is also capped at this fraction of the shortest member.
const MAX_STACK_FRACTION = 0.4
const ARROWS_PER_ELEMENT = 5

const labelStyle = (color: string): Partial<CSSStyleDeclaration> => ({ fontSize: '11px', color, textShadow: '0 0 2px #fff, 0 0 2px #fff' })

/** DOF labels by position: 2D is X, Y, rotation about Z; 3D adds Z and the X/Y rotations. Anything past that falls back to a number. */
function dofName(i: number, ndm: number): string {
  const names = ndm === 2 ? ['Fx', 'Fy', 'Mz'] : ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz']
  return names[i] ?? `F${i + 1}`
}

/** Global-axis direction of a beam-uniform load, from the member's local axes (see `memberFrame`: 2D y is x turned 90° CCW; 3D follows the transformation's `vecxz`). */
function elementLoadVector(a: Vector3, b: Vector3, ndm: 2 | 3, vecxz: unknown, wx: number, wy: number, wz: number): Vector3 {
  const frame = memberFrame(a.toArray(), b.toArray(), ndm, vecxz)
  if (!frame) return new Vector3()
  const [x, y, z] = [frame.x, frame.y, frame.z].map((v) => new Vector3(...v))
  return x.multiplyScalar(wx).add(y.multiplyScalar(wy)).add(z.multiplyScalar(ndm === 3 ? wz : 0))
}

/** A nodal arrow: at `at`, pointing along `dir` (any length), with an optional label. */
interface NodalArrow { at: [number, number, number]; dir: [number, number, number]; label?: string }

/** Nodal arrows of one colour: three segments each (shaft, two head wings), sized in pixels at each arrow's own depth. */
function NodalArrows({ arrows, color }: { arrows: NodalArrow[]; color: string }) {
  const { lines, write } = useSegmentLines(arrows.length * 3, color, 2)
  const changed = useCameraChange()
  const filled = useRef<object | null>(null)
  const seenAnchor = useRef<Float32Array | null>(null)
  // Per segment endpoint: the anchor and its offset in pixels.
  const { anchor, px } = useMemo(() => {
    const anchor = new Float32Array(arrows.length * 18), px = new Float32Array(arrows.length * 18)
    arrows.forEach((a, i) => {
      const d = new Vector3(...a.dir).normalize()
      const tip = d.clone().multiplyScalar(ARROW_LENGTH), side = d.clone().multiplyScalar(ARROW_HEAD_LENGTH)
      const up = Math.abs(d.z) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1)
      const right = new Vector3().crossVectors(side, up).normalize().multiplyScalar(ARROW_HEAD_WIDTH)
      const pts = [new Vector3(), tip, tip, tip.clone().sub(side).add(right), tip, tip.clone().sub(side).sub(right)]
      pts.forEach((p, k) => { anchor.set(a.at, i * 18 + k * 3); px.set([p.x, p.y, p.z], i * 18 + k * 3) })
    })
    return { anchor, px }
  }, [arrows])
  useFrame((state) => {
    if (!changed(state, filled.current !== lines || seenAnchor.current !== anchor)) return
    filled.current = lines
    seenAnchor.current = anchor
    const tmp = new Vector3()
    write((buf) => {
      for (let i = 0; i < arrows.length; i++) {
        const s = worldUnitsPerPixel(state.camera, tmp.set(...arrows[i].at), state.size.height)
        for (let k = i * 18; k < i * 18 + 18; k++) buf[k] = anchor[k] + px[k] * s
      }
    })
  })
  const labels = useMemo<ScreenLabel[]>(() => arrows.filter((a) => a.label).map((a) => ({ position: a.at, text: a.label! })), [arrows])
  const style = useMemo(() => labelStyle(color), [color])
  return <>{arrows.length > 0 && <primitive object={lines} />}{labels.length > 0 && <ScreenLabels labels={labels} style={style} offset={[6, -18]} />}</>
}

interface MemberLoad { pid: number; a: Vector3; b: Vector3; w: Vector3; label: string }

/**
 * Member-load boxes of one colour: per member, a rectangle (member line, tail line, two ends) and a row of arrows. Each point is
 * `fixed + unit * scaled`, `unit` being the shared pixel scale (capped so the stack stays inside the shortest member).
 */
function MemberLoadBoxes({ loads, ratioFor, offsetFor, refPoint, maxUnit, color, showValues }: { loads: MemberLoad[]; ratioFor: (l: MemberLoad) => number; offsetFor: (l: MemberLoad) => number; refPoint: Vector3; maxUnit: number; color: string; showValues: boolean }) {
  const perLoad = 4 + ARROWS_PER_ELEMENT * 3
  const { lines, write } = useSegmentLines(loads.length * perLoad, color, 1.5)
  const changed = useCameraChange()
  const filled = useRef<object | null>(null)
  const anchors = useRef({ fixed: new Float32Array(), scaled: new Float32Array() })
  const { fixed, scaled } = useMemo(() => {
    const fixed = new Float32Array(loads.length * perLoad * 6), scaled = new Float32Array(loads.length * perLoad * 6)
    let o = 0
    // A point is (base, k): fixed part `base`, scaled part `k` (per unit of pixel scale).
    const push = (base: Vector3, k: Vector3) => { fixed.set([base.x, base.y, base.z], o); scaled.set([k.x, k.y, k.z], o); o += 3 }
    for (const l of loads) {
      const dir = l.w.clone().normalize()
      const along = l.b.clone().sub(l.a).normalize()
      const spread = along.clone().sub(dir.clone().multiplyScalar(along.dot(dir)))
      if (spread.lengthSq() < 1e-9) spread.crossVectors(dir, Math.abs(dir.z) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1))
      spread.normalize()
      const ratio = ratioFor(l)
      const head = Math.min(ratio * 0.3, ARROW_HEAD_MAX_PX / MAX_LEN_PX)
      const off = dir.clone().multiplyScalar(-offsetFor(l)), tail = dir.clone().multiplyScalar(-ratio)
      const headBack = dir.clone().multiplyScalar(-head), wing = spread.clone().multiplyScalar(head * 0.6)
      const seg = (ba: Vector3, ka: Vector3, bb: Vector3, kb: Vector3) => { push(ba, ka); push(bb, kb) }
      seg(l.a, off, l.b, off)
      seg(l.a, off.clone().add(tail), l.b, off.clone().add(tail))
      seg(l.a, off, l.a, off.clone().add(tail))
      seg(l.b, off, l.b, off.clone().add(tail))
      for (let k = 0; k < ARROWS_PER_ELEMENT; k++) {
        const tip = l.a.clone().lerp(l.b, (k + 0.5) / ARROWS_PER_ELEMENT)
        seg(tip, off.clone().add(tail), tip, off)
        seg(tip, off, tip, off.clone().add(headBack).add(wing))
        seg(tip, off, tip, off.clone().add(headBack).sub(wing))
      }
    }
    return { fixed, scaled }
  }, [loads, ratioFor, offsetFor, perLoad])
  useFrame((state) => {
    // New load data with the same buffer size must redraw too.
    const fresh = filled.current !== lines || anchors.current.fixed !== fixed
    if (!changed(state, fresh)) return
    filled.current = lines
    anchors.current = { fixed, scaled }
    const unit = Math.min(worldUnitsPerPixel(state.camera, refPoint, state.size.height) * MAX_LEN_PX, maxUnit)
    write((buf) => { for (let i = 0; i < fixed.length; i++) buf[i] = fixed[i] + scaled[i] * unit })
  })
  const labels = useMemo<ScreenLabel[]>(() => (showValues ? loads.map((l) => ({ position: l.a.clone().lerp(l.b, 0.5).toArray() as [number, number, number], text: l.label })) : []), [loads, showValues])
  const style = useMemo(() => labelStyle(color), [color])
  return <>{loads.length > 0 && <primitive object={lines} />}{labels.length > 0 && <ScreenLabels labels={labels} style={style} offset={[6, 6]} />}</>
}

/** Renders nodal `load` and uniform `eleLoad` assignments from the patterns not hidden (Model entities, not a command history position). */
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

export function LoadsLayer({ patterns, nodeMap, elementMap, geomTransfs, sections, ndm, hiddenPatterns, showNodal, showElement, showValues }: {
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
  const data = useMemo(() => {
    const ids = patterns.map((p) => p.id).sort((x, y) => x - y)
    const visible = patterns.filter((p) => !hiddenPatterns.includes(p.id))
    const colorOf = (pid: number) => patternColor(ids, pid)

    const memberLoads: MemberLoad[] = showElement ? visible.flatMap((p) => p.children.flatMap((c) => {
      if (c.kind !== 'eleLoad' || eleLoadKind(c.args) !== 'beam') return []
      const { eleTags, wx, wy, wz } = c.args as { eleTags: number[]; wx?: number; wy: number; wz: number }
      const label = [['wx', wx], ['wy', wy], ['wz', wz]].filter(([, v]) => Number(v)).map(([n, v]) => `${n}: ${formatLoadValue(Number(v))}`).join('  ')
      return (eleTags ?? []).flatMap((tag) => {
        const ele = elementMap.get(tag)
        const n1 = ele && nodeMap.get(ele.nodes[0]), n2 = ele && nodeMap.get(ele.nodes[1])
        if (!n1 || !n2) return []
        const a = new Vector3(...toVec3(n1.coords)), b = new Vector3(...toVec3(n2.coords))
        if (a.distanceToSquared(b) < 1e-18) return []
        const w = elementLoadVector(a, b, ndm === 2 ? 2 : 3, geomTransfs.get(Number(ele.args.transfTag))?.args.vecxz, Number(wx) || 0, Number(wy) || 0, Number(wz) || 0)
        return w.length() < 1e-12 ? [] : [{ pid: p.id, a, b, w, label }]
      })
    })) : []
    // Stud-wall loads (Carapace-only) sit on the wall's top row: a line load as a member-load box (drawn at its mean), a point as an arrow.
    const wallPoints: (NodalArrow & { color: string })[] = []
    if (showElement) for (const p of visible) for (const c of p.children) {
      if (c.kind !== 'eleLoad' || eleLoadKind(c.args) !== 'wall') continue
      const w = wallLoadSpec(c.args)
      for (const tag of (c.args.eleTags as number[] | undefined) ?? []) {
        const ele = elementMap.get(tag)
        const [p0, p1, , p3] = (ele?.nodes.slice(0, 4) ?? []).map((n) => nodeMap.get(n))
        if (!p0 || !p1 || !p3) continue
        const o = new Vector3(...toVec3(p0.coords)), ex = new Vector3(...toVec3(p1.coords)).sub(o), ey = new Vector3(...toVec3(p3.coords)).sub(o)
        const L = ex.length()
        if (L < 1e-12) continue
        ex.normalize()
        const top = (x: number) => o.clone().add(ey).addScaledVector(ex, x)
        const vec = (along: number, up: number) => ex.clone().multiplyScalar(along).addScaledVector(ey.clone().normalize(), up)
        if (w.kind === 'topPoint') {
          const dir = vec(w.fx, w.fy)
          if (dir.length() < 1e-12) continue
          const label = showValues ? [['fx', w.fx], ['fy', w.fy]].filter(([, v]) => v).map(([n, v]) => `${n}: ${formatLoadValue(Number(v))}`).join('  ') : undefined
          wallPoints.push({ at: top(w.x).toArray(), dir: dir.toArray(), label, color: colorOf(p.id) })
        } else {
          const mean = vec((w.wx0 + w.wx1) / 2, (w.wy0 + w.wy1) / 2)
          if (mean.length() < 1e-12 || w.x1 === w.x0) continue
          const range = (n: string, a: number, b: number) => (a || b ? `${n}: ${formatLoadValue(a)}${a === b ? '' : ` → ${formatLoadValue(b)}`}` : '')
          memberLoads.push({ pid: p.id, a: top(w.x0), b: top(w.x1), w: mean, label: [range('wx', w.wx0, w.wx1), range('wy', w.wy0, w.wy1)].filter(Boolean).join('  ') })
        }
      }
    }
    const maxW = memberLoads.reduce((m, l) => Math.max(m, l.w.length()), 0)
    const ratioFor = (l: MemberLoad) => Math.max(MIN_LEN_RATIO, l.w.length() / maxW)
    const refPoint = new Vector3()
    for (const l of memberLoads) refPoint.add(l.a).add(l.b)
    if (memberLoads.length) refPoint.divideScalar(memberLoads.length * 2)
    // Stack patterns outward from the member in id order so their boxes don't overlap.
    const offsetByPattern = new Map<number, number>()
    let stacked = 0
    for (const pid of ids) {
      const mine = memberLoads.filter((l) => l.pid === pid)
      if (!mine.length) continue
      offsetByPattern.set(pid, stacked)
      stacked += mine.reduce((m, l) => Math.max(m, ratioFor(l)), 0)
    }
    let minLen = Infinity
    if (memberLoads.length) for (const e of elementMap.values()) {
      if (isShell(e.eleType)) continue
      const n1 = nodeMap.get(e.nodes[0]), n2 = nodeMap.get(e.nodes[1])
      const d = n1 && n2 ? Math.hypot(...[0, 1, 2].map((k) => (n2.coords[k] ?? 0) - (n1.coords[k] ?? 0))) : 0
      if (d > 1e-12) minLen = Math.min(minLen, d) // zero-length springs would collapse every box
    }
    const maxUnit = Number.isFinite(minLen) && stacked > 0 ? (MAX_STACK_FRACTION * minLen) / stacked : Infinity

    const nodal: (NodalArrow & { color: string })[] = []
    if (showNodal) for (const p of visible) for (const c of p.children) {
      if (c.kind !== 'load') continue
      const args = c.args as { nodeTag: number; values: number[] }
      const node = nodeMap.get(args.nodeTag)
      const v = args.values ?? []
      if (!node || Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) < 1e-9) continue
      const label = showValues ? v.map((x, i) => (x ? `${dofName(i, ndm)}: ${formatLoadValue(x)}` : null)).filter(Boolean).join('  ') : undefined
      nodal.push({ at: toVec3(node.coords), dir: [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0], label, color: colorOf(p.id) })
    }

    nodal.push(...wallPoints)
    // Past GLYPH_LIMIT arrows the value labels are dropped (the viewport names them as hidden).
    if (batchesLoads(nodal.length)) for (const n of nodal) n.label = undefined
    const colors = [...new Set([...memberLoads.map((l) => colorOf(l.pid)), ...nodal.map((n) => n.color)])]
    return {
      groups: colors.map((color) => ({ color, members: memberLoads.filter((l) => colorOf(l.pid) === color), nodal: nodal.filter((n) => n.color === color) })),
      ratioFor, offsetFor: (l: MemberLoad) => offsetByPattern.get(l.pid) ?? 0, refPoint, maxUnit,
    }
  }, [patterns, hiddenPatterns, showElement, showNodal, showValues, elementMap, nodeMap, geomTransfs, ndm])
  // Shell pressure and self-weight: the shells coloured by their total area load, with the parts on hover.
  const shellLoads = useMemo(() => (showElement ? shellAreaLoads(patterns, hiddenPatterns, elementMap, nodeMap, sections) : new Map<number, ShellAreaLoad>()), [patterns, hiddenPatterns, elementMap, nodeMap, sections, showElement])

  return (
    <>
      {shellLoads.size > 0 && <ShellLoadContour loads={shellLoads} patterns={patterns} nodeMap={nodeMap} elementMap={elementMap} />}
      {data.groups.map((g) => (
        <group key={g.color}>
          {g.nodal.length > 0 && <NodalArrows arrows={g.nodal} color={g.color} />}
          {g.members.length > 0 && <MemberLoadBoxes loads={g.members} ratioFor={data.ratioFor} offsetFor={data.offsetFor} refPoint={data.refPoint} maxUnit={data.maxUnit} color={g.color} showValues={showValues} />}
        </group>
      ))}
    </>
  )
}
