import { useEffect, useMemo, useRef, useState } from 'react'
import type { FiberSectionItem } from '@/app/types/model'

const MIN_SIZE = 260
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

const MESH_STROKE = '#475569'
/** Skip mesh lines once cells get too small to read (px). */
const MIN_CELL_PX = 3

/** Mesh lines for a rect patch: numSubdivY columns × numSubdivZ rows, matching how OpenSees divides the patch into fibers. */
function rectMesh(a: Record<string, unknown>, project: (y: number, z: number) => [number, number]) {
  const nY = Math.max(1, Math.round(Number(a.numSubdivY)) || 1), nZ = Math.max(1, Math.round(Number(a.numSubdivZ)) || 1)
  const y1 = Number(a.y1), y2 = Number(a.y2), z1 = Number(a.z1), z2 = Number(a.z2)
  const [xa, ya] = project(y1, z1), [xb, yb] = project(y2, z2)
  const lines: [number, number, number, number][] = []
  if (Math.abs(xb - xa) / nY >= MIN_CELL_PX) for (let k = 1; k < nY; k++) { const x = xa + ((xb - xa) * k) / nY; lines.push([x, ya, x, yb]) }
  if (Math.abs(yb - ya) / nZ >= MIN_CELL_PX) for (let k = 1; k < nZ; k++) { const y = ya + ((yb - ya) * k) / nZ; lines.push([xa, y, xb, y]) }
  return lines
}

/** Mesh for a circ patch: nRad concentric rings between intRad and extRad, nCirc spokes across the sweep angle. */
function circMesh(a: Record<string, unknown>, project: (y: number, z: number) => [number, number], scale: number) {
  const nC = Math.max(1, Math.round(Number(a.numSubdivCirc)) || 1), nR = Math.max(1, Math.round(Number(a.numSubdivRad)) || 1)
  const yc = Number(a.yCenter) || 0, zc = Number(a.zCenter) || 0
  const r1 = Number(a.intRad) || 0, r2 = Number(a.extRad) || 0
  const a0 = ((Number(a.startAng) || 0) * Math.PI) / 180
  const a1 = ((a.endAng === undefined ? 360 : Number(a.endAng)) * Math.PI) / 180
  const full = Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9
  const rings: string[] = []
  if ((r2 - r1) * scale / nR >= MIN_CELL_PX) {
    for (let k = 1; k < nR; k++) {
      const r = r1 + ((r2 - r1) * k) / nR
      const pts = Array.from({ length: 65 }, (_, j) => project(yc + r * Math.cos(a0 + ((a1 - a0) * j) / 64), zc + r * Math.sin(a0 + ((a1 - a0) * j) / 64)))
      rings.push(pts.map(([x, y], j) => `${j ? 'L' : 'M'}${x} ${y}`).join(' '))
    }
  }
  const spokes: [number, number, number, number][] = []
  if ((2 * Math.PI * Math.max(r2, 1e-9) * scale * (Math.abs(a1 - a0) / (2 * Math.PI))) / nC >= MIN_CELL_PX) {
    for (let k = 0; k <= (full ? nC - 1 : nC); k++) {
      const th = a0 + ((a1 - a0) * k) / nC
      const [x1, y1] = project(yc + r1 * Math.cos(th), zc + r1 * Math.sin(th))
      const [x2, y2] = project(yc + r2 * Math.cos(th), zc + r2 * Math.sin(th))
      spokes.push([x1, y1, x2, y2])
    }
  }
  return { rings, spokes }
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
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: MIN_SIZE, h: MIN_SIZE })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(100, e.contentRect.width), h: Math.max(100, e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = Math.min((size.w - 2 * PAD) / (bounds.maxY - bounds.minY), (size.h - 2 * PAD) / (bounds.maxZ - bounds.minZ))
  // Centre the section in whatever space the container gives us.
  const offX = (size.w - (bounds.maxY - bounds.minY) * scale) / 2
  const offY = (size.h - (bounds.maxZ - bounds.minZ) * scale) / 2
  const project = (y: number, z: number): [number, number] => [
    offX + (y - bounds.minY) * scale,
    size.h - offY - (z - bounds.minZ) * scale,
  ]

  return (
    <div ref={box} className="border rounded-sm bg-muted/30 relative w-[42%] min-w-[260px] shrink-0 self-stretch min-h-0 overflow-hidden">
      <svg width={size.w} height={size.h} className="absolute inset-0">
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
            return (
              <g key={i}>
                <rect x={x} y={y} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="#93c5fd66" stroke={stroke} strokeWidth={strokeWidth} {...handlers} />
                <g stroke={MESH_STROKE} strokeWidth={0.5} strokeOpacity={0.6} pointerEvents="none">
                  {rectMesh(a, project).map(([ax, ay, bx, by], j) => <line key={j} x1={ax} y1={ay} x2={bx} y2={by} />)}
                </g>
              </g>
            )
          }
          if (c.kind === 'patch' && c.subType === 'circ') {
            const yc = Number(a.yCenter) || 0, zc = Number(a.zCenter) || 0
            const [cx, cy] = project(yc, zc)
            const rOuter = (Number(a.extRad) || 0) * scale
            const rInner = (Number(a.intRad) || 0) * scale
            const mesh = circMesh(a, project, scale)
            const meshEl = (
              <g stroke={MESH_STROKE} strokeWidth={0.5} strokeOpacity={0.6} fill="none" pointerEvents="none">
                {mesh.rings.map((d, j) => <path key={`r${j}`} d={d} />)}
                {mesh.spokes.map(([ax, ay, bx, by], j) => <line key={`s${j}`} x1={ax} y1={ay} x2={bx} y2={by} />)}
              </g>
            )
            if (rInner > 0) {
              return (
                <g key={i}>
                <path
                  fillRule="evenodd"
                  d={`M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 0 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 0 ${cx - rOuter} ${cy} Z M ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 1 1 ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 1 1 ${cx - rInner} ${cy} Z`}
                  fill="#93c5fd66"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  {...handlers}
                />
                {meshEl}
                </g>
              )
            }
            return <g key={i}><circle cx={cx} cy={cy} r={rOuter} fill="#93c5fd66" stroke={stroke} strokeWidth={strokeWidth} {...handlers} />{meshEl}</g>
          }
          if (c.kind === 'fiber') {
            const [cx, cy] = project(Number(a.yloc), Number(a.zloc))
            // True-to-scale bar radius, floored to a visible dot and capped so tiny sections don't get giant bars.
            const r = Math.max(1.5, Math.min(8, Math.sqrt((Number(a.A) || 0) / Math.PI) * scale))
            return <circle key={i} cx={cx} cy={cy} r={r} fill={isSelected ? 'var(--primary)' : '#b45309'} stroke={stroke} strokeWidth={strokeWidth} {...handlers} />
          }
          return null
        })}
      </svg>
    </div>
  )
}
