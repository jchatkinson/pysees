import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { ElementEntity } from '@/app/types/model'
import type { DisplayBuffers } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'
import { worldUnitsPerPixel } from './screenScale'
import { useCameraChange, useSegmentLines } from './batchHooks'
import { buildGlyph, coupledDofs, isZeroLengthType, orientFrame } from './zeroLengthGlyph'

const GLYPH_COLOR = '#4b5563'
const RING_RADIUS_PX = 10
/** Extra radius per additional zero-length element sharing the same node, so stacked rings stay distinct. */
const RING_STACK_STEP_PX = 4

interface GlyphSpec {
  id: number
  nodeRow: number
  ndm: 2 | 3
  dofs: number[]
  orient: unknown
  section: boolean
  radius: number
}

/**
 * Zero-length elements have no length to draw, so each gets a screen-sized ring at its node with a
 * mark per coupled DOF (translation stubs, rotation arcs) along the element's local `-orient` axes.
 */
export function ZeroLengthsLayer({
  index,
  buffers,
  elements,
  ndm,
}: {
  index: SceneIndex
  buffers: DisplayBuffers
  elements: Map<number, ElementEntity>
  ndm: 2 | 3
}) {
  const specs = useMemo(() => {
    const perNode = new Map<number, number>()
    const out: GlyphSpec[] = []
    index.elementIds.forEach((id, j) => {
      const el = elements.get(id)
      if (!el || !isZeroLengthType(el.eleType)) return
      const nodeRow = index.elementNodes[j][0]
      const stack = perNode.get(nodeRow) ?? 0
      perNode.set(nodeRow, stack + 1)
      out.push({
        id,
        nodeRow,
        ndm,
        dofs: coupledDofs(el.eleType, el.args, ndm),
        orient: el.args.orient,
        section: el.eleType === 'zeroLengthSection',
        radius: RING_RADIUS_PX + stack * RING_STACK_STEP_PX,
      })
    })
    return out
  }, [index, elements, ndm])

  // Segments in pixel units: rings in the billboard plane (turned to face the camera), stubs and arcs along the element's axes.
  const geo = useMemo(() => specs.map((spec) => {
    const glyph = buildGlyph(spec.dofs, orientFrame(spec.orient), spec.ndm, spec.radius)
    const pairs = (pts: number[][]) => pts.slice(1).map((q, i) => [pts[i], q])
    return { spec, ring: pairs(glyph.ring), lines: glyph.lines.flatMap(pairs) }
  }), [specs])
  const counts = useMemo(() => ({ thin: geo.reduce((n, g) => n + g.lines.length + (g.spec.section ? 0 : g.ring.length), 0), thick: geo.reduce((n, g) => n + (g.spec.section ? g.ring.length : 0), 0) }), [geo])
  const thin = useSegmentLines(counts.thin, GLYPH_COLOR, 1.5)
  const thick = useSegmentLines(counts.thick, GLYPH_COLOR, 2.5)
  const changed = useCameraChange()
  const seen = useRef<{ lines: object; version: number } | null>(null)
  useFrame((state) => {
    const fresh = seen.current?.lines !== thin.lines || seen.current?.version !== buffers.version
    if (!changed(state, fresh)) return
    seen.current = { lines: thin.lines, version: buffers.version }
    const q = state.camera.quaternion, tmp = new Vector3(), v = new Vector3()
    const put = (buf: Float32Array, o: number, at: Vector3, scale: number, p: number[], billboard: boolean) => {
      v.set(p[0], p[1], p[2])
      if (billboard) v.applyQuaternion(q)
      buf[o] = at.x + v.x * scale; buf[o + 1] = at.y + v.y * scale; buf[o + 2] = at.z + v.z * scale
    }
    let ti = 0, ki = 0
    // Both buffers are filled inside the nested writes, so each uploads once, after filling.
    thin.write((tb) => thick.write((kb) => {
      for (const { spec, ring, lines } of geo) {
        tmp.fromArray(buffers.nodePositions, spec.nodeRow * 3)
        const scale = worldUnitsPerPixel(state.camera, tmp, state.size.height)
        for (const [a, b] of ring) {
          const buf = spec.section ? kb : tb, o = (spec.section ? ki++ : ti++) * 6
          put(buf, o, tmp, scale, a, true); put(buf, o + 3, tmp, scale, b, true)
        }
        for (const [a, b] of lines) { const o = ti++ * 6; put(tb, o, tmp, scale, a, false); put(tb, o + 3, tmp, scale, b, false) }
      }
    }))
  })
  return <>{counts.thin > 0 && <primitive object={thin.lines} />}{counts.thick > 0 && <primitive object={thick.lines} />}</>
}
