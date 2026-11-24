import { useEffect, useMemo, useRef } from 'react'
import { useThree, type RootState } from '@react-three/fiber'
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib'

/**
 * Batched drawing helpers for many small things (labels, glyphs). One draw call or one DOM pass per layer, recomputed only when the
 * camera, viewport size or the data changes, instead of one component with its own per-frame work per item.
 */

/** True on the first call and whenever the camera's view, projection or the viewport size changed since the last call. */
export function useCameraChange() {
  const last = useRef<number[] | null>(null)
  return (state: Pick<RootState, 'camera' | 'size'>, force = false) => {
    const c = state.camera
    const now = [...c.matrixWorld.elements, ...c.projectionMatrix.elements, state.size.width, state.size.height]
    const prev = last.current
    if (!force && prev && prev.every((v, i) => v === now[i])) return false
    last.current = now
    return true
  }
}

/** One fat-line draw for a buffer of `capacity` segments (start xyz, end xyz), rewritten through `write`. A new buffer comes with new `lines`. */
export function useSegmentLines(capacity: number, color: string, widthPx: number) {
  const size = useThree((s) => s.size)
  const material = useMemo(() => new LineMaterial({ color: color as never, linewidth: widthPx }), [color, widthPx])
  const { lines, positions } = useMemo(() => {
    const positions = new Float32Array(Math.max(1, capacity) * 6)
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    const lines = new LineSegments2(geometry, material)
    lines.frustumCulled = false
    lines.raycast = () => {}
    return { lines, positions }
  }, [capacity, material])
  useEffect(() => { material.resolution.set(size.width, size.height) }, [material, size])
  useEffect(() => () => lines.geometry.dispose(), [lines])
  useEffect(() => () => material.dispose(), [material])
  /** Rewrite the segment buffer (`fill` gets it in place) and upload it. */
  const write = (fill: (buf: Float32Array) => void) => { fill(positions); lines.geometry.setPositions(positions) }
  return { lines, write }
}

