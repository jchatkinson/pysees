import type { FiberSectionItem } from '@/app/types/model'
import type { Point2 } from '@/app/lib/sections/types'

/** ops.patch('rect', matTag, numSubdivY, numSubdivZ, *crdsI, *crdsJ) */
export function rectPatch(matId: number, y1: number, z1: number, y2: number, z2: number, numSubdivY: number, numSubdivZ: number): FiberSectionItem {
  return { kind: 'patch', subType: 'rect', args: { matTag: matId, numSubdivY, numSubdivZ, y1, z1, y2, z2 } }
}

/** ops.patch('circ', matTag, numSubdivCirc, numSubdivRad, *center, *rad, *ang) */
export function circPatch(matId: number, yCenter: number, zCenter: number, intRad: number, extRad: number, numSubdivCirc: number, numSubdivRad: number, startAng = 0, endAng = 360): FiberSectionItem {
  return { kind: 'patch', subType: 'circ', args: { matTag: matId, numSubdivCirc, numSubdivRad, yCenter, zCenter, intRad, extRad, startAng, endAng } }
}

/** ops.fiber(yloc, zloc, A, matTag) */
export function singleFiber(matId: number, y: number, z: number, area: number): FiberSectionItem {
  return { kind: 'fiber', subType: 'fiber', args: { yloc: y, zloc: z, A: area, matTag: matId } }
}

/** 4 corner bars + evenly spaced bars along each face (nBarsY per top/bottom, nBarsZ per left/right, corners shared) of a rectangle centered at the origin. */
export function rectPerimeterBars(halfY: number, halfZ: number, cover: number, nBarsY: number, nBarsZ: number): Point2[] {
  const y = halfY - cover
  const z = halfZ - cover
  const pts: Point2[] = [{ y: -y, z: -z }, { y, z: -z }, { y, z }, { y: -y, z }]
  const nY = Math.max(0, nBarsY - 2)
  const nZ = Math.max(0, nBarsZ - 2)
  for (let i = 1; i <= nY; i++) {
    const t = -y + (2 * y * i) / (nY + 1)
    pts.push({ y: t, z: -z }, { y: t, z })
  }
  for (let i = 1; i <= nZ; i++) {
    const t = -z + (2 * z * i) / (nZ + 1)
    pts.push({ y: -y, z: t }, { y, z: t })
  }
  return pts
}

/** `count` points evenly spaced around a ring of the given radius, centered at the origin. */
export function ringBars(radius: number, count: number): Point2[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count
    return { y: radius * Math.cos(a), z: radius * Math.sin(a) }
  })
}

/** A regular polygon approximating a circle of the given radius, for outline/preview rendering. */
export function circleOutlinePoints(radius: number, segments = 64): Point2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (2 * Math.PI * i) / segments
    return { y: radius * Math.cos(a), z: radius * Math.sin(a) }
  })
}
