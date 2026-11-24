import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { FixEntity, NodeEntity } from '@/app/types/model'
import { toVec3 } from './utils'
import { worldUnitsPerPixel } from './screenScale'
import { useCameraChange, useSegmentLines } from './batchHooks'

/** Half-length of each support axis line, in screen pixels. */
const FIX_GLYPH_SIZE = 20
const AXES: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

/** Every support as one fat-line draw: a red axis line per fixed translation, sized in pixels at each node, redrawn when the camera moves. */
export function SupportsLayer({ fixes, nodeMap }: { fixes: FixEntity[]; nodeMap: Map<number, NodeEntity> }) {
  const segs = useMemo(() => {
    const out: { at: [number, number, number]; axis: [number, number, number] }[] = []
    for (const fix of fixes) {
      const node = nodeMap.get(fix.nodeId)
      if (!node) continue
      const at = toVec3(node.coords)
      AXES.forEach((axis, k) => { if (fix.dofs.includes(k + 1)) out.push({ at, axis }) })
    }
    return out
  }, [fixes, nodeMap])
  const { lines, write } = useSegmentLines(segs.length, '#dc2626', 2)
  const changed = useCameraChange()
  const filled = useRef<object | null>(null)
  const seenSegs = useRef<typeof segs | null>(null)
  useFrame((state) => {
    const fresh = filled.current !== lines || seenSegs.current !== segs
    if (!changed(state, fresh)) return
    filled.current = lines
    seenSegs.current = segs
    const tmp = new Vector3()
    write((buf) => segs.forEach(({ at, axis }, i) => {
      const t = worldUnitsPerPixel(state.camera, tmp.set(...at), state.size.height) * FIX_GLYPH_SIZE
      for (let k = 0; k < 3; k++) { buf[i * 6 + k] = at[k] - axis[k] * t; buf[i * 6 + 3 + k] = at[k] + axis[k] * t }
    }))
  })
  return segs.length ? <primitive object={lines} /> : null
}
