import { MathUtils, OrthographicCamera, PerspectiveCamera } from 'three'
import type { Camera, Vector3 } from 'three'

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
