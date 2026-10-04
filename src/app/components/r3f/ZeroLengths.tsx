import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Group } from 'three'
import type { ElementEntity } from '@/app/types/model'
import type { DisplayBuffers } from './displayBuffers'
import type { SceneIndex } from './sceneIndex'
import { ScreenSize } from './ScreenSize'
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

function ZeroLengthGlyph({ spec, buffers }: { spec: GlyphSpec; buffers: DisplayBuffers }) {
  const anchor = useRef<Group>(null)
  const billboard = useRef<Group>(null)
  const glyph = useMemo(
    () => buildGlyph(spec.dofs, orientFrame(spec.orient), spec.ndm, spec.radius),
    [spec.dofs, spec.orient, spec.ndm, spec.radius],
  )
  const width = spec.section ? 2.5 : 1.5

  // Follow the displayed (possibly displaced) node; keep the ring facing the camera.
  useFrame(({ camera }) => {
    const g = anchor.current
    if (g) g.position.fromArray(buffers.nodePositions, spec.nodeRow * 3)
    if (billboard.current) billboard.current.quaternion.copy(camera.quaternion)
  })

  return (
    <group ref={anchor}>
      <ScreenSize>
        <group ref={billboard}>
          <Line points={glyph.ring} color={GLYPH_COLOR} lineWidth={width} />
        </group>
        {glyph.lines.map((points, i) => (
          <Line key={i} points={points} color={GLYPH_COLOR} lineWidth={1.5} />
        ))}
      </ScreenSize>
    </group>
  )
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

  return (
    <>
      {specs.map((spec) => (
        <ZeroLengthGlyph key={spec.id} spec={spec} buffers={buffers} />
      ))}
    </>
  )
}
