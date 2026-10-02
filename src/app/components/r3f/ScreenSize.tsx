import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import type { Camera, Group } from 'three'
import type { ThreeElements } from '@react-three/fiber'

type GroupProps = ThreeElements['group']

const tmp = new Vector3()

/** World units spanned by one screen pixel at `worldPos` for the given camera. */
export function worldUnitsPerPixel(camera: Camera, worldPos: Vector3, viewportHeightPx: number): number {
  if (camera instanceof PerspectiveCamera) {
    const dist = camera.position.distanceTo(worldPos)
    return (2 * dist * Math.tan(MathUtils.degToRad(camera.fov) / 2)) / viewportHeightPx
  }
  if (camera instanceof OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / viewportHeightPx
  }
  return 1
}

/**
 * Group whose children are sized in screen pixels: 1 local unit == `px` pixels at any zoom.
 * Position it at the anchor point and give children pixel-sized geometry.
 */
export function ScreenSize({ px = 1, children, ...props }: GroupProps & { px?: number }) {
  const ref = useRef<Group>(null)
  useFrame(({ camera, size }) => {
    const g = ref.current
    if (!g) return
    g.getWorldPosition(tmp)
    g.scale.setScalar(worldUnitsPerPixel(camera, tmp, size.height) * px)
  })
  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  )
}
