import { useMemo } from 'react'
import type { FiberSectionItem } from '@/app/types/model'

const SIZE = 260
const PAD = 24

interface Bounds { minY: number; maxY: number; minZ: number; maxZ: number }

function boundsFor(children: FiberSectionItem[]): Bounds {
  const ys: number[] = []
  const zs: number[] = []
  for (const c of children) {
    const a = c.args
    if (c.kind === 'patch' && c.subType === 'rect') {
      ys.push(Number(a.y1), Number(a.y2))
      zs.push(Number(a.z1), Number(a.z2))
    } else if (c.kind === 'patch' && c.subType === 'circ') {
      const yc = Number(a.yCenter) || 0, zc = Number(a.zCenter) || 0, r = Number(a.extRad) || 0
      ys.push(yc - r, yc + r)
      zs.push(zc - r, zc + r)
    } else if (c.kind === 'fiber') {
      ys.push(Number(a.yloc))
      zs.push(Number(a.zloc))
    }
  }
  if (ys.length === 0) return { minY: -1, maxY: 1, minZ: -1, maxZ: 1 }
  const minY = Math.min(...ys), maxY = Math.max(...ys, minY + 1e-6)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs, minZ + 1e-6)
  return { minY, maxY, minZ, maxZ }
}

/** Live SVG cross-section preview: renders every patch/fiber child directly from the draft's current children, so it's always in sync with the form — no separate outline model needed here. */
export function SectionPreview({ children, hoveredIndex = null, selectedIndex = null, onHoverChild, onSelectChild }: {
  children: FiberSectionItem[]
  hoveredIndex?: number | null
  selectedIndex?: number | null
  onHoverChild?: (index: number | null) => void
  onSelectChild?: (index: number | null) => void
}) {
  const bounds = useMemo(() => boundsFor(children), [children])
  const scale = Math.min((SIZE - 2 * PAD) / (bounds.maxY - bounds.minY), (SIZE - 2 * PAD) / (bounds.maxZ - bounds.minZ))
  const project = (y: number, z: number): [number, number] => [
    PAD + (y - bounds.minY) * scale,
    SIZE - PAD - (z - bounds.minZ) * scale,
  ]

  return (
    <div className="border rounded-sm bg-muted/30 shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE}>
        {children.map((c, i) => {
          const a = c.args
          const isHover = hoveredIndex === i
          const isSelected = selectedIndex === i
          const stroke = isSelected ? 'var(--primary)' : isHover ? 'var(--foreground)' : '#64748b'
          const strokeWidth = isSelected || isHover ? 2 : 1
          const handlers = {
            onMouseEnter: () => onHoverChild?.(i),
            onMouseLeave: () => onHoverChild?.(null),
            onClick: () => onSelectChild?.(i),
            className: onSelectChild ? 'cursor-pointer' : undefined,
          }
          if (c.kind === 'patch' && c.subType === 'rect') {
            const [x1, y1] = project(Number(a.y1), Number(a.z1))
            const [x2, y2] = project(Number(a.y2), Number(a.z2))
            const x = Math.min(x1, x2), y = Math.min(y1, y2)
            return <rect key={i} x={x} y={y} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="#93c5fd66" stroke={stroke} strokeWidth={strokeWidth} {...handlers} />
          }
          if (c.kind === 'patch' && c.subType === 'circ') {
            const yc = Number(a.yCenter) || 0, zc = Number(a.zCenter) || 0
            const [cx, cy] = project(yc, zc)
            const rOuter = (Number(a.extRad) || 0) * scale
            const rInner = (Number(a.intRad) || 0) * scale
            if (rInner > 0) {
              return (
                <path
                  key={i}
                  fillRule="evenodd"
                  d={`M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 0 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 0 ${cx - rOuter} ${cy} Z M ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 1 1 ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 1 1 ${cx - rInner} ${cy} Z`}
                  fill="#93c5fd66"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  {...handlers}
                />
              )
            }
            return <circle key={i} cx={cx} cy={cy} r={rOuter} fill="#93c5fd66" stroke={stroke} strokeWidth={strokeWidth} {...handlers} />
          }
          if (c.kind === 'fiber') {
            const [cx, cy] = project(Number(a.yloc), Number(a.zloc))
            const r = Math.max(2.5, Math.min(6, Math.sqrt(Number(a.A) || 0) * 400))
            return <circle key={i} cx={cx} cy={cy} r={r} fill={isSelected ? 'var(--primary)' : '#b45309'} stroke={stroke} strokeWidth={strokeWidth} {...handlers} />
          }
          return null
        })}
      </svg>
    </div>
  )
}
