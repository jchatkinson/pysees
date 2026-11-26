import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { MPConstraintEntity } from '@/app/types/model'
import type { DisplayBuffers } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'
import { useSegmentLines } from './batchHooks'

/** Multi-point constraints as one thin line draw: retained node to each constrained node (a diaphragm's spokes, equalDOF and rigid links), following the displaced shape. */
export function ConstraintsLayer({ constraints, index, buffers }: { constraints: Map<number, MPConstraintEntity>; index: SceneIndex; buffers: DisplayBuffers }) {
  const pairs = useMemo(() => {
    const out: [number, number][] = []
    for (const c of constraints.values()) {
      const r = index.nodeIndex.get(Number(c.args.rNodeTag))
      if (r === undefined) continue
      const cs = c.kind === 'rigidDiaphragm' ? ((c.args.cNodeTags as unknown[]) ?? []) : [c.args.cNodeTag]
      for (const n of cs) { const j = index.nodeIndex.get(Number(n)); if (j !== undefined && j !== r) out.push([r, j]) }
    }
    return out
  }, [constraints, index])
  const { lines, write } = useSegmentLines(pairs.length, '#ddd6fe', 1)
  const seen = useRef<{ lines: object; buffers: object; version: number; pairs: object } | null>(null)
  useFrame(() => {
    if (seen.current?.lines === lines && seen.current.buffers === buffers && seen.current.version === buffers.version && seen.current.pairs === pairs) return
    seen.current = { lines, buffers, version: buffers.version, pairs }
    const p = buffers.nodePositions
    write((buf) => pairs.forEach(([a, b], i) => { for (let k = 0; k < 3; k++) { buf[i * 6 + k] = p[a * 3 + k]; buf[i * 6 + 3 + k] = p[b * 3 + k] } }))
  })
  return pairs.length ? <primitive object={lines} /> : null
}
