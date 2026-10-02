import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Group } from 'three'
import { worldUnitsPerPixel } from './screenScale'
import type { ThreeElements } from '@react-three/fiber'

type GroupProps = ThreeElements['group']

const tmp = new Vector3()

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
