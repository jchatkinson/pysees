import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ElementEntity } from '@/app/types/model'
import { studWallArgs } from '@/app/lib/studWalls'
import type { DisplayBuffers } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'
import { useSegmentLines } from './batchHooks'

/** A segment in a wall's own (u, v) square: u along the wall, v up, both 0..1 between its corners. */
type UV = [number, number, number, number]
interface WallLines { corners: [number, number, number, number]; studs: UV[]; openings: UV[] }

/**
 * Stud-wall framing drawn on the wall face: a thin line per stud, and each opening as its outline (to the head height; below it there
 * are no members) crossed by its diagonals. Points are placed bilinearly between the wall's four corners, so they follow the deformed shape.
 */
export function WallDetailLayer({ index, buffers, elements }: { index: SceneIndex; buffers: DisplayBuffers; elements: Map<number, ElementEntity> }) {
  const walls = useMemo(() => {
    const out: WallLines[] = []
    index.elementIds.forEach((id, j) => {
      if (index.elementKind[j] !== 'wall') return
      const el = elements.get(id)
      if (!el) return
      const corners = el.nodes.slice(0, 4).map((n) => index.nodeIndex.get(n)) as [number, number, number, number]
      if (corners.some((r) => r === undefined)) return
      const { layout } = studWallArgs(el.args)
      const c = index.nodeCoords, d = (a: number, b: number) => Math.hypot(c[a * 3] - c[b * 3], c[a * 3 + 1] - c[b * 3 + 1], c[a * 3 + 2] - c[b * 3 + 2])
      const L = d(corners[0], corners[1]) || layout.length, H = d(corners[0], corners[3]) || layout.height
      const top = Math.min(1, layout.height / H)
      const openings = (layout.openings ?? []).flatMap((o): UV[] => {
        const [a, b, h] = [o.x0 / L, o.x1 / L, Math.min(1, o.headHeight / H)]
        return [[a, 0, b, 0], [b, 0, b, h], [b, h, a, h], [a, h, a, 0], [a, 0, b, h], [b, 0, a, h]]
      })
      const inside = (x: number) => !(layout.openings ?? []).some((o) => x > o.x0 + 1e-9 && x < o.x1 - 1e-9)
      const studs = layout.studs.filter((s) => s.x > 1e-9 && s.x < layout.length - 1e-9 && inside(s.x)).map((s): UV => [s.x / L, 0, s.x / L, top])
      if (top < 1) studs.push([0, top, 1, top]) // the top plate under a floor zone
      out.push({ corners, studs, openings })
    })
    return out
  }, [index, elements])
  const counts = useMemo(() => ({ studs: walls.reduce((n, w) => n + w.studs.length, 0), openings: walls.reduce((n, w) => n + w.openings.length, 0) }), [walls])
  const studs = useSegmentLines(counts.studs, '#94a3b8', 1)
  const openings = useSegmentLines(counts.openings, '#334155', 1.5)
  const seen = useRef<{ lines: object; buffers: object; version: number; walls: object } | null>(null)
  useFrame(() => {
    if (seen.current?.lines === studs.lines && seen.current.buffers === buffers && seen.current.version === buffers.version && seen.current.walls === walls) return
    seen.current = { lines: studs.lines, buffers, version: buffers.version, walls }
    const p = buffers.nodePositions
    // Bilinear between corners: bottom start (0,0), bottom end (1,0), top end (1,1), top start (0,1).
    const put = (buf: Float32Array, o: number, [r0, r1, r2, r3]: WallLines['corners'], u: number, v: number) => {
      for (let k = 0; k < 3; k++) buf[o + k] = (1 - v) * ((1 - u) * p[r0 * 3 + k] + u * p[r1 * 3 + k]) + v * ((1 - u) * p[r3 * 3 + k] + u * p[r2 * 3 + k])
    }
    const fill = (key: 'studs' | 'openings') => (buf: Float32Array) => {
      let i = 0
      for (const w of walls) for (const [u0, v0, u1, v1] of w[key]) { put(buf, i * 6, w.corners, u0, v0); put(buf, i * 6 + 3, w.corners, u1, v1); i++ }
    }
    studs.write(fill('studs'))
    openings.write(fill('openings'))
  })
  return <>{counts.studs > 0 && <primitive object={studs.lines} />}{counts.openings > 0 && <primitive object={openings.lines} />}</>
}
