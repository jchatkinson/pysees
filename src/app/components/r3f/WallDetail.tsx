import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ElementEntity, Model } from '@/app/types/model'
import { floorJoists } from '@/app/lib/floors'
import { studWallArgs } from '@/app/lib/studWalls'
import type { DisplayBuffers } from './displayBuffers'
import { wallPoint, type SceneIndex, type WallChords } from './sceneIndex'
import { useSegmentLines } from './batchHooks'

/** A segment in a wall's own (u, v) square: u along the wall, v up, both 0..1 between its corners. */
type UV = [number, number, number, number]
interface WallLines { chords: WallChords; studs: UV[]; openings: UV[] }

/**
 * Stud-wall framing drawn on the wall face: a thin line per stud, and each opening as its outline (to the head height; below it there
 * are no members) crossed by its diagonals. Points are placed between the wall's bottom and top chords (`wallPoint`), so they follow the
 * deformed shape through every station and, for a bearing wall, the nodes it stands on.
 */
export function WallDetailLayer({ index, buffers, elements }: { index: SceneIndex; buffers: DisplayBuffers; elements: Map<number, ElementEntity> }) {
  const walls = useMemo(() => index.studWalls.flatMap((w): WallLines[] => {
    const el = elements.get(index.elementIds[w.e])
    if (!el) return []
    const { layout } = studWallArgs(el.args)
    const L = w.length, H = w.height
    const openings = (layout.openings ?? []).flatMap((o): UV[] => {
      const [a, b, h] = [o.x0 / L, o.x1 / L, Math.min(1, o.headHeight / H)]
      return [[a, 0, b, 0], [b, 0, b, h], [b, h, a, h], [a, h, a, 0], [a, 0, b, h], [b, 0, a, h]]
    })
    const inside = (x: number) => !(layout.openings ?? []).some((o) => x > o.x0 + 1e-9 && x < o.x1 - 1e-9)
    const studs = layout.studs.filter((s) => s.x > 1e-9 && s.x < L - 1e-9 && inside(s.x)).map((s): UV => [s.x / L, 0, s.x / L, w.framing])
    if (w.framing < 1) for (let i = 0; i + 1 < w.chords.top.length; i++) studs.push([w.chords.top[i].u, w.framing, w.chords.top[i + 1].u, w.framing]) // the top plate under a floor zone
    return [{ chords: w.chords, studs, openings }]
  }), [index, elements])
  const counts = useMemo(() => ({ studs: walls.reduce((n, w) => n + w.studs.length, 0), openings: walls.reduce((n, w) => n + w.openings.length, 0) }), [walls])
  const studs = useSegmentLines(counts.studs, '#94a3b8', 1, true)
  const openings = useSegmentLines(counts.openings, '#334155', 1.5)
  const seen = useRef<{ lines: object; buffers: object; version: number; walls: object } | null>(null)
  useFrame(() => {
    if (seen.current?.lines === studs.lines && seen.current.buffers === buffers && seen.current.version === buffers.version && seen.current.walls === walls) return
    seen.current = { lines: studs.lines, buffers, version: buffers.version, walls }
    const p = buffers.nodePositions
    const fill = (key: 'studs' | 'openings') => (buf: Float32Array) => {
      let i = 0
      for (const w of walls) for (const [u0, v0, u1, v1] of w[key]) { wallPoint(p, w.chords, u0, v0, buf, i * 6); wallPoint(p, w.chords, u1, v1, buf, i * 6 + 3); i++ }
    }
    studs.write(fill('studs'))
    openings.write(fill('openings'))
  })
  return <>{counts.studs > 0 && <primitive object={studs.lines} />}{counts.openings > 0 && <primitive object={openings.lines} />}</>
}

/**
 * Joist floors' joist lines on the floor plane (undeformed): one per joist across the outline, so the span direction reads in the line
 * view. Hidden on displaced shapes, where the floor outline itself follows its nodes.
 */
export function FloorJoistLayer({ index, elements, model }: { index: SceneIndex; elements: Map<number, ElementEntity>; model: Model }) {
  const segments = useMemo(() => {
    const out: number[] = []
    index.elementIds.forEach((id, e) => {
      if (index.elementKind[e] !== 'floor') return
      const el = elements.get(id), j = el && floorJoists(model, el)
      if (j) for (const [p, q] of j.lines) out.push(p[0], p[1], j.z, q[0], q[1], j.z)
    })
    return out
  }, [index, elements, model])
  const joists = useSegmentLines(segments.length / 6, '#a16207', 1, true)
  const seen = useRef<{ lines: object; segments: number[] } | null>(null)
  useFrame(() => {
    if (seen.current?.lines === joists.lines && seen.current.segments === segments) return
    seen.current = { lines: joists.lines, segments }
    joists.write((buf) => buf.set(segments))
  })
  return segments.length > 0 ? <primitive object={joists.lines} /> : null
}
