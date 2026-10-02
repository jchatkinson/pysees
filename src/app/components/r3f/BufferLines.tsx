import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'
import type { InterleavedBufferAttribute } from 'three'

/**
 * Fat line segments (`fillSegmentPositions` layout: start xyz, end xyz) drawn from a shared `positions`
 * array that something else rewrites. Each frame it re-uploads when `getVersion()` changes and shows
 * only while `isActive()`; `getCount()` limits how many leading segments are drawn.
 */
export function BufferLines({ positions, color, widthPx, isActive, getVersion, getCount }: {
  positions: Float32Array
  color: number
  widthPx: number
  isActive: () => boolean
  getVersion: () => number
  getCount?: () => number
}) {
  const size = useThree((s) => s.size)
  const ref = useRef<LineSegments2>(null)
  const seen = useRef(-1)
  const material = useMemo(() => new LineMaterial({ color, linewidth: widthPx }), [color, widthPx])
  const lines = useMemo(() => {
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    const l = new LineSegments2(geometry, material)
    l.frustumCulled = false
    l.visible = false
    return l
  }, [positions, material])

  useEffect(() => { seen.current = -1 }, [lines])

  useFrame(() => {
    const l = ref.current
    if (!l) return
    l.visible = isActive()
    if (!l.visible || seen.current === getVersion()) return
    const data = (l.geometry.attributes.instanceStart as InterleavedBufferAttribute).data
    ;(data.array as Float32Array).set(positions)
    data.needsUpdate = true
    if (getCount) l.geometry.instanceCount = getCount()
    seen.current = getVersion()
  })

  useEffect(() => { material.resolution.set(size.width, size.height) }, [material, size])
  useEffect(() => () => lines.geometry.dispose(), [lines])
  useEffect(() => () => material.dispose(), [material])

  return <primitive ref={ref} object={lines} />
}
