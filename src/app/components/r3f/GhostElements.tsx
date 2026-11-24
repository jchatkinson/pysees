import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { ElementEntity, NodeEntity } from '@/app/types/model'
import { toVec3 } from './utils'

const GHOST_COLOR = '#94a3b8'
const noRaycast = () => null

/** The story above a plan, as faint dashed outlines: context only, so it is never picked or snapped to. */
export function GhostElements({ elements, nodes }: { elements: ElementEntity[]; nodes: Map<number, NodeEntity> }) {
  const { points, dash } = useMemo(() => {
    const points: [number, number, number][] = []
    const columns: [number, number, number][] = []
    let extent = 0
    for (const e of elements) {
      const ps = e.nodes.map((id) => nodes.get(id)).filter((n): n is NodeEntity => !!n).map((n) => toVec3(n.coords))
      const closed = ps.length > 2
      // A column seen from above is a point: mark it with a small square at its top instead.
      if (ps.length === 2 && Math.hypot(ps[1][0] - ps[0][0], ps[1][1] - ps[0][1]) < 1e-6 * Math.max(1, Math.abs(ps[1][2] - ps[0][2]))) {
        columns.push(ps[0][2] > ps[1][2] ? ps[0] : ps[1])
        extent = Math.max(extent, Math.abs(ps[1][2] - ps[0][2]))
        continue
      }
      for (let k = 0; k < (closed ? ps.length : ps.length - 1); k++) {
        const a = ps[k], b = ps[(k + 1) % ps.length]
        points.push(a, b)
        extent = Math.max(extent, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
      }
    }
    const dash = Math.max(extent, 1e-9) / 25
    const h = dash * 1.5
    for (const [x, y, zz] of columns) {
      const c: [number, number, number][] = [[x - h, y - h, zz], [x + h, y - h, zz], [x + h, y + h, zz], [x - h, y + h, zz]]
      for (let k = 0; k < 4; k++) points.push(c[k], c[(k + 1) % 4])
    }
    return { points, dash }
  }, [elements, nodes])
  if (points.length === 0) return null
  return <Line points={points} segments dashed dashSize={dash} gapSize={dash * 0.7} color={GHOST_COLOR} lineWidth={1} transparent opacity={0.7} raycast={noRaycast} />
}
