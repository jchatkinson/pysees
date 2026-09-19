import type { SectionEntity } from '@/app/types/model'
import type { Point2, SectionOutline } from '@/app/lib/sections/types'
import { circleOutlinePoints } from '@/app/lib/sections/discretize'
import { SECTION_TEMPLATES } from '@/app/lib/sections/templates'

/** Best-effort outline for a section with no template metadata (hand-edited, or built outside the Section Editor): the bounding box of its patch children. Ignores fiber/layer detail by design. */
function fallbackOutline(section: SectionEntity): SectionOutline {
  const points: Point2[] = []
  for (const child of section.children) {
    if (child.kind !== 'patch') continue
    const a = child.args
    if (child.subType === 'rect') {
      const y1 = Number(a.y1), z1 = Number(a.z1), y2 = Number(a.y2), z2 = Number(a.z2)
      points.push({ y: y1, z: z1 }, { y: y2, z: z2 })
    } else if (child.subType === 'circ') {
      const yc = Number(a.yCenter) || 0, zc = Number(a.zCenter) || 0, r = Number(a.extRad) || 0
      for (const p of circleOutlinePoints(r, 16)) points.push({ y: yc + p.y, z: zc + p.z })
    }
  }
  if (points.length === 0) return { outer: [], holes: [] }
  const minY = Math.min(...points.map((p) => p.y))
  const maxY = Math.max(...points.map((p) => p.y))
  const minZ = Math.min(...points.map((p) => p.z))
  const maxZ = Math.max(...points.map((p) => p.z))
  return { outer: [{ y: minY, z: minZ }, { y: maxY, z: minZ }, { y: maxY, z: maxZ }, { y: minY, z: maxZ }], holes: [] }
}

/** Pure, fiber/rebar-agnostic outline geometry for a section — used by the live cross-section preview, and reusable later by the 3D viewport to render an element's actual section shape instead of a plain line. */
export function sectionOutline(section: SectionEntity): SectionOutline {
  if (section.template) {
    const tpl = SECTION_TEMPLATES[section.template.kind]
    if (tpl) return tpl.outline(section.template.params)
  }
  return fallbackOutline(section)
}
