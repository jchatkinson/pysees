import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { CanvasTexture, DoubleSide, LinearMipmapLinearFilter, PlaneGeometry, SRGBColorSpace } from 'three'
import type { UnderlayEntity } from '@/app/types/underlays'
import type { LevelEntity } from '@/app/types/levels'
import type { ViewMode } from '@/app/lib/editor/viewSlice'
import { levelElevations } from '@/app/lib/levels'
import { underlayImage } from '@/app/lib/underlays/pdfRender'
import { pdfToWorld } from '@/app/lib/underlays/transform'

const TARGET_PX = 4096
const noRaycast = () => {}
/** Unit square with its corner at the origin: scaled to the page and placed at the underlay's origin. */
const PLANE = new PlaneGeometry(1, 1).translate(0.5, 0.5, 0)

function Underlay({ u, z }: { u: UnderlayEntity; z: number }) {
  const { gl, invalidate } = useThree()
  const longSide = Math.min(TARGET_PX, gl.capabilities.maxTextureSize)
  const [texture, setTexture] = useState<CanvasTexture | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true, made: CanvasTexture | null = null
    void underlayImage(u.file, u.page, longSide, u.knockout).then((canvas) => {
      if (!alive) return
      setMissing(!canvas)
      if (canvas) {
        made = new CanvasTexture(canvas)
        made.colorSpace = SRGBColorSpace
        made.minFilter = LinearMipmapLinearFilter
        made.anisotropy = gl.capabilities.getMaxAnisotropy()
      }
      setTexture(made)
      invalidate()
    })
    return () => { alive = false; made?.dispose() }
  }, [u.file, u.page, u.knockout, longSide, gl, invalidate])

  const [w, h] = u.pageSize
  // The cropped part of the page (page points); the texture shows the same part.
  const [x0, y0, x1, y1] = u.crop ?? [0, 0, w, h]
  useEffect(() => {
    if (!texture) return
    texture.repeat.set((x1 - x0) / w, (y1 - y0) / h)
    texture.offset.set(x0 / w, y0 / h)
    invalidate()
  }, [texture, x0, y0, x1, y1, w, h, invalidate])
  const corner = pdfToWorld(u, [x0, y0])
  // Just below the level so members and grids drawn at the level stay in front of the sheet.
  const below = 1e-4 * Math.max(w, h) * u.scale
  return (
    <mesh geometry={PLANE} position={[corner[0], corner[1], z - below]} rotation={[0, 0, u.rotation]} scale={[(x1 - x0) * u.scale, (y1 - y0) * u.scale, 1]} raycast={noRaycast} renderOrder={-1}>
      {texture
        ? <meshBasicMaterial map={texture} transparent opacity={u.opacity} depthWrite={false} side={DoubleSide} toneMapped={false} />
        : <meshBasicMaterial color={missing ? '#f59e0b' : '#cbd5e1'} transparent opacity={0.15} depthWrite={false} side={DoubleSide} />}
    </mesh>
  )
}

/** PDF sheets under the plan of their level (3D models; in the 3D view too with `show3D`), or all of them behind a 2D model's XY plane. */
export function UnderlaysLayer({ underlays, levels, mode, ndm, show3D }: { underlays: UnderlayEntity[]; levels: LevelEntity[]; mode: ViewMode; ndm: 2 | 3; show3D: boolean }) {
  const shown = useMemo(() => {
    const elev = new Map<number | null, number>([[null, 0]])
    levelElevations(levels).forEach((z, i) => elev.set(levels[i].id, z))
    const visible = underlays.filter((u) => u.visible)
    if (ndm === 2) return visible.map((u) => ({ u, z: 0 }))
    const planLevel = mode.kind === 'plan' ? (mode.level < 0 ? null : levels[mode.level]?.id) : undefined
    const onLevel = (u: UnderlayEntity) => (mode.kind === 'plan' ? u.level === planLevel : mode.kind === '3d' && show3D)
    return visible.filter((u) => elev.has(u.level) && onLevel(u)).map((u) => ({ u, z: elev.get(u.level)! }))
  }, [underlays, levels, mode, ndm, show3D])
  return <>{shown.map(({ u, z }) => <Underlay key={u.id} u={u} z={z} />)}</>
}
