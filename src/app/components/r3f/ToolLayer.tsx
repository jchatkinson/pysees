import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import type { ElementEntity, NodeEntity } from '@/app/types/model'
import { planElevation, gridSlab, type ViewMode } from '@/app/lib/editor/viewSlice'
import { DrawBatch, storyMap, supportDofs, transfTypeFor, type P3 } from '@/app/lib/editor/draw'
import { useUnits } from '@/app/lib/units/useUnits'
import { shouldIgnoreHotkeys } from '@/app/lib/hotkeys'
import { templateKey, templateOf } from '@/app/lib/editor/properties'
import { bayAt, bayLines, cellAt, meshQuad, gridPoints, inGridSlab, pickSnap, snapPoints, workElevations, type Screen, type SnapPoint } from '@/app/lib/editor/snap'
import { levelElevations } from '@/app/lib/levels'
import { ScreenSize } from './ScreenSize'
import { drawStudWall } from '@/app/lib/studWalls'

const SNAP_PX = 12
type Hover = { point: P3 | null; snap: SnapPoint | null; bay: [P3, P3] | null; cell?: P3[] | null }
const NO_HOVER: Hover = { point: null, snap: null, bay: null }
const PREVIEW = '#2563eb'
const SNAP_COLOR: Record<SnapPoint['kind'], string> = { node: '#16a34a', grid: '#2563eb', mid: '#d97706' }

/** Round a point on the work plane to `step`, only along global axes lying in the plane (a skewed elevation keeps its x/y). */
function roundToIncrement(p: P3, normal: Vector3, step: number): P3 {
  const n = [normal.x, normal.y, normal.z]
  return p.map((v, i) => (Math.abs(n[i]) < 1e-9 && n.filter((c) => Math.abs(c) > 1e-9).length === 1 ? Math.round(v / step) * step : v)).map((v) => Number(v.toPrecision(12))) as P3
}

/** The plane a view draws on: the plan's level, the elevation grid's vertical plane, the XY plane in 2D, else ground (z = 0). */
function workPlane(mode: ViewMode, ndm: 2 | 3, levels: ReturnType<typeof useAppStore.getState>['levels'], grids: ReturnType<typeof useAppStore.getState>['gridlines']): Plane {
  if (ndm === 2) return new Plane(new Vector3(0, 0, 1), 0)
  if (mode.kind === 'plan') return new Plane(new Vector3(0, 0, 1), -planElevation(levels, mode.level))
  if (mode.kind === 'elevation') {
    const slab = mode.gridId === null ? null : gridSlab(grids, mode.gridId, 0)
    if (!slab) return new Plane(new Vector3(0, 1, 0), 0)
    const n = new Vector3(slab.normal.x, slab.normal.y, 0)
    return new Plane(n, -(n.x * slab.origin.x + n.y * slab.origin.y))
  }
  return new Plane(new Vector3(0, 0, 1), 0)
}

/**
 * The active draw tool: turns pointer moves into a snapped point (or the bay under the cursor), draws the preview, and on click
 * commits the tool's writes as one undo step. Frame draws a chain of members (right-click or Esc ends it); quick beams/columns fill
 * the bay under the cursor; support fixes the node under the cursor with the chosen preset.
 */
export function ToolLayer({ mode, nodes, elements, ndm }: { mode: ViewMode; nodes: Map<number, NodeEntity>; elements: Map<number, ElementEntity>; ndm: 2 | 3 }) {
  const tool = useAppStore((s) => s.activeTool)
  const template = useAppStore((s) => s.drawTemplate)
  const preset = useAppStore((s) => s.supportPreset)
  const levels = useAppStore((s) => s.levels)
  const grids = useAppStore((s) => s.gridlines)
  const { camera, gl, size } = useThree()
  const [hover, setHover] = useState<Hover>(NO_HOVER)
  const [start, setStart] = useState<P3 | null>(null)
  const shift = useRef(false)
  const last = useRef<P3 | null>(null)
  const units = useUnits()

  const plane = useMemo(() => workPlane(mode, ndm, levels, grids), [mode, ndm, levels, grids])
  const snaps = useMemo(() => {
    const keep = (p: P3) => (mode.kind === 'elevation' && mode.gridId !== null ? inGridSlab(grids, mode.gridId, p, 1e-6) : true)
    return snapPoints(nodes, elements, gridPoints(grids, workElevations(mode, levels), ndm, keep))
  }, [nodes, elements, grids, levels, mode, ndm])
  // Free (unsnapped) points land on a drawing increment: 1/100 of the model's order of magnitude (0.1 for a 10 m model).
  const increment = useMemo(() => {
    let extent = 0
    for (const n of nodes.values()) for (const c of n.coords) extent = Math.max(extent, Math.abs(c))
    for (const g of grids) for (const c of [...g.start, ...g.end]) extent = Math.max(extent, Math.abs(c))
    return 10 ** (Math.floor(Math.log10(Math.max(extent, 1))) - 2)
  }, [nodes, grids])
  const beamLines = useMemo(() => bayLines('beam', mode, grids, levels, ndm), [mode, grids, levels, ndm])
  const columnLines = useMemo(() => bayLines('column', mode, grids, levels, ndm), [mode, grids, levels, ndm])

  const [seenTool, setSeenTool] = useState(tool)
  if (seenTool !== tool) { setSeenTool(tool); setStart(null); setHover(NO_HOVER) }
  // A typed length belongs to the chain it was typed for.
  useEffect(() => { useAppStore.getState().setToolInput('') }, [start, tool])

  useEffect(() => {
    if (tool === 'select') return
    const el = gl.domElement
    const project = (p: P3): Screen | null => {
      const v = new Vector3(...p).project(camera)
      return v.z > 1 ? null : { x: (v.x + 1) * 0.5 * size.width, y: (1 - v.y) * 0.5 * size.height }
    }
    const read = (e: PointerEvent | MouseEvent): Hover => {
      const r = el.getBoundingClientRect()
      const cursor = { x: e.clientX - r.left, y: e.clientY - r.top }
      const ray = new Raycaster()
      ray.setFromCamera(new Vector2((cursor.x / r.width) * 2 - 1, -(cursor.y / r.height) * 2 + 1), camera)
      const hit = ray.ray.intersectPlane(plane, new Vector3())
      const onPlane: P3 | null = hit ? roundToIncrement([hit.x, hit.y, hit.z], plane.normal, increment) : null
      const s = useAppStore.getState()
      if (tool === 'shell') return { point: null, snap: null, bay: null, cell: onPlane ? cellAt(mode, s.gridlines, s.levels, onPlane) : null }
      if (tool === 'quickBeam' || (tool === 'quickColumn' && mode.kind !== 'plan')) {
        return { point: null, snap: null, bay: onPlane ? bayAt(tool === 'quickBeam' ? beamLines : columnLines, onPlane, project, cursor, SNAP_PX) : null }
      }
      if (tool === 'quickColumn') {
        const snap = pickSnap(snaps, project, cursor, SNAP_PX, ['grid', 'node'])
        const level = mode.kind === 'plan' ? mode.level : -1
        if (!snap || level < 0) return { point: null, snap, bay: null }
        const z0 = level === 0 ? 0 : levelElevations(s.levels)[level - 1]
        return { point: null, snap, bay: [[snap.p[0], snap.p[1], z0], [snap.p[0], snap.p[1], planElevation(s.levels, level)]] as [P3, P3] }
      }
      const snap = pickSnap(snaps, project, cursor, SNAP_PX, tool === 'support' ? ['node'] : undefined)
      let point = snap?.p ?? (tool === 'support' ? null : onPlane)
      // Shift locks the segment to the nearer global axis from the chain's start.
      if (point && !snap && start && shift.current) {
        const d = [point[0] - start[0], point[1] - start[1], point[2] - start[2]]
        const k = d.map(Math.abs).indexOf(Math.max(...d.map(Math.abs)))
        point = start.map((v, i) => (i === k ? point![i] : v)) as P3
      }
      return { point, snap, bay: null }
    }
    // With "all stories" in a plan, the same geometry is drawn on every story, mapped level to level.
    const commit = (fill: (b: DrawBatch, at: (p: P3) => P3) => void, perStory = true) => {
      const s = useAppStore.getState()
      const b = new DrawBatch(s.model)
      const all = perStory && s.drawAllStories && mode.kind === 'plan' && mode.level >= 0
      const targets = all ? s.levels.map((_, j) => j) : [mode.kind === 'plan' ? mode.level : -1]
      for (const j of targets) fill(b, mode.kind === 'plan' && mode.level >= 0 ? storyMap(s.levels, mode.level, j) : (p) => p)
      if (b.writes.length) s.writeModelEntities(b.writes)
    }
    const transfType = () => {
      const s = useAppStore.getState()
      const key = template ? templateKey(template) : ''
      return transfTypeFor(s.model, [...s.model.elements.values()].filter((e) => templateKey(templateOf(e)) === key))
    }
    const onMove = (e: PointerEvent) => { shift.current = e.shiftKey; const h = read(e); last.current = h.point; setHover(h) }
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return
      const h = read(e)
      if (tool === 'support') {
        if (h.snap?.nodeId !== undefined) { const id = h.snap.nodeId; commit((b) => b.support(id, supportDofs(preset, ndm, useAppStore.getState().model.config?.ndf ?? 6)), false) }
        return
      }
      if (tool === 'shell') {
        const s = useAppStore.getState(), cell = h.cell, t = s.shellTemplate
        if (cell && t) commit((b, at) => { for (const q of meshQuad(cell, s.shellDivisions, s.shellDivisions)) b.shell(t, q.map(at)) })
        return
      }
      if (!template && tool !== 'studWall') return
      if (template && (tool === 'quickBeam' || tool === 'quickColumn')) { const bay = h.bay; if (bay) commit((b, at) => { b.member(template, at(bay[0]), at(bay[1]), transfType()) }); return }
      if (!h.point) return
      place(h.point)
    }
    const place = (p: P3) => {
      if (start && tool === 'studWall') {
        // A wall spans the shown story: from the level below (the base under the first story) up to the plan's level.
        const s = useAppStore.getState(), t = s.wallTemplate, a = start
        if (!t || mode.kind !== 'plan' || mode.level < 0) return
        const below = [0, ...levelElevations(s.levels)][mode.level]
        commit((b, at) => { const A = at(a), B = at(p); drawStudWall(b, A, B, at([a[0], a[1], below])[2], A[2], t) })
      } else if (start && template) { const a = start; commit((b, at) => { b.member(template, at(a), at(p), transfType()) }) }
      setStart(p)
    }
    const onContext = (e: MouseEvent) => { if (start) { e.preventDefault(); setStart(null) } }
    // Typing after the first point of a chain enters a length (`6`, `6 ft`); Enter places the next point that far towards the cursor.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shift.current = e.type === 'keydown'
      if (e.type !== 'keydown' || shouldIgnoreHotkeys(e.target)) return
      const s = useAppStore.getState()
      const typing = (tool === 'frame' || tool === 'studWall') && start && !e.ctrlKey && !e.metaKey && !e.altKey
      const consume = () => { e.preventDefault(); e.stopImmediatePropagation() }
      if (typing && /^[0-9.,'"a-zA-Z ]$/.test(e.key) && (s.toolInput !== '' || /[0-9.]/.test(e.key))) { consume(); s.setToolInput(s.toolInput + e.key); return }
      if (typing && e.key === 'Backspace' && s.toolInput) { consume(); s.setToolInput(s.toolInput.slice(0, -1)); return }
      if (e.key === 'Enter' && typing && s.toolInput) {
        consume()
        const len = units.parse('length', s.toolInput)
        s.setToolInput('')
        const to = last.current
        if (len === null || !start) return
        const d = to ? [to[0] - start[0], to[1] - start[1], to[2] - start[2]] : [1, 0, 0]
        const n = Math.hypot(d[0], d[1], d[2]) || 1
        place([start[0] + (d[0] / n) * len, start[1] + (d[1] / n) * len, start[2] + (d[2] / n) * len])
        return
      }
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      if (s.toolInput) { consume(); s.setToolInput(''); return }
      if (start) setStart(null)
      else if (e.key === 'Escape') s.setActiveTool('select')
    }
    const onLeave = () => setHover(NO_HOVER)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('click', onClick)
    el.addEventListener('contextmenu', onContext)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('click', onClick)
      el.removeEventListener('contextmenu', onContext)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey)
    }
  }, [tool, template, preset, camera, gl, size, plane, snaps, beamLines, columnLines, mode, ndm, start, units, increment])

  if (tool === 'select') return null
  const noRaycast = () => null
  return (
    <>
      {start && hover.point && <Line points={[start, hover.point]} color={PREVIEW} lineWidth={2} raycast={noRaycast} />}
      {start && <ScreenSize position={start}><mesh raycast={noRaycast}><boxGeometry args={[7, 7, 7]} /><meshBasicMaterial color={PREVIEW} /></mesh></ScreenSize>}
      {hover.cell && <Line points={[...hover.cell, hover.cell[0]]} color={PREVIEW} lineWidth={3} transparent opacity={0.7} raycast={noRaycast} />}
      {hover.bay && <Line points={hover.bay} color={PREVIEW} lineWidth={4} transparent opacity={0.6} raycast={noRaycast} />}
      {hover.snap && (
        <ScreenSize position={hover.snap.p}>
          <Line points={[[-7, -7, 0], [7, -7, 0], [7, 7, 0], [-7, 7, 0], [-7, -7, 0]]} color={SNAP_COLOR[hover.snap.kind]} lineWidth={2} raycast={noRaycast} />
        </ScreenSize>
      )}
    </>
  )
}
