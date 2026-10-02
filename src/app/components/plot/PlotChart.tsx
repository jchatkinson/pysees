import { useEffect, useMemo, useRef, useState } from 'react'
import { decimate, extentOf, formatTick, invertLinear, linear, nearestPoint, niceTicks } from '@/app/lib/plot/geometry'

export interface ChartSeries {
  id: string
  label: string
  color: string
  x: Float64Array
  y: Float64Array
}

interface View { x0: number; x1: number; y0: number; y1: number }

const M = { l: 58, r: 14, t: 10, b: 38 }
const MAX_POINTS = 8000
const HIT_RADIUS_PX = 24

/**
 * Minimal SVG x-y plot: nice-tick axes, one polyline per series (decimated when long), a marker at
 * the current step, drag-box zoom (double-click resets), hover readout, and click-to-scrub — a click
 * near a point reports that point's step index.
 */
export function PlotChart({ series, xLabel, yLabel, step, markerX, stageX, onScrub }: {
  series: ChartSeries[]
  xLabel: string
  yLabel: string
  /** Current step; its point is marked on every series. Null hides the markers. */
  step: number | null
  /** X value of the current step when X is step or pseudo-time (draws a vertical line); otherwise null. */
  markerX: number | null
  /** X values where a new analysis stage begins (dashed lines); empty to hide. */
  stageX: number[]
  onScrub: (step: number) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View | null>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pw = Math.max(10, size.w - M.l - M.r)
  const ph = Math.max(10, size.h - M.t - M.b)

  const decimated = useMemo(() => series.map((s) => decimate(s.x, s.y, MAX_POINTS)), [series])
  const auto = useMemo<View>(() => {
    const xe = extentOf(...series.map((s) => s.x))
    const ye = extentOf(...series.map((s) => s.y))
    const xt = niceTicks(xe?.min ?? 0, xe?.max ?? 1, 6)
    const yt = niceTicks(ye?.min ?? 0, ye?.max ?? 1, 6)
    return { x0: xt.min, x1: xt.max, y0: yt.min, y1: yt.max }
  }, [series])
  const dom = view ?? auto

  const xTicks = useMemo(() => niceTicks(dom.x0, dom.x1, Math.max(2, Math.floor(pw / 80))).ticks.filter((t) => t >= dom.x0 - 1e-12 && t <= dom.x1 + 1e-12), [dom.x0, dom.x1, pw])
  const yTicks = useMemo(() => niceTicks(dom.y0, dom.y1, Math.max(2, Math.floor(ph / 50))).ticks.filter((t) => t >= dom.y0 - 1e-12 && t <= dom.y1 + 1e-12), [dom.y0, dom.y1, ph])

  const sx = useMemo(() => linear(dom.x0, dom.x1, 0, pw), [dom.x0, dom.x1, pw])
  const sy = useMemo(() => linear(dom.y0, dom.y1, ph, 0), [dom.y0, dom.y1, ph])

  const paths = useMemo(() => series.map((s, k) => {
    let d = ''
    const idx = decimated[k]
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j]
      if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i])) continue
      d += `${d ? 'L' : 'M'}${sx(s.x[i]).toFixed(1)} ${sy(s.y[i]).toFixed(1)}`
    }
    return d
  }), [series, decimated, sx, sy])

  const local = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - M.l, y: e.clientY - r.top - M.t }
  }
  const hit = (p: { x: number; y: number }) => {
    let best: { s: number; i: number; dist: number } | null = null
    series.forEach((s, k) => {
      const n = nearestPoint(p.x, p.y, decimated[k], s.x, s.y, sx, sy)
      if (n && (!best || n.dist < best.dist)) best = { s: k, i: decimated[k][n.k], dist: n.dist }
    })
    return best as { s: number; i: number; dist: number } | null
  }
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x <= pw && p.y >= 0 && p.y <= ph

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const p = local(e)
    if (!inside(p)) return
    svgRef.current!.setPointerCapture(e.pointerId)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e)
    if (drag) { setDrag({ ...drag, x1: p.x, y1: p.y }); setHover(null); return }
    const h = inside(p) ? hit(p) : null
    setHover(h && h.dist <= HIT_RADIUS_PX ? { s: h.s, i: h.i } : null)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return
    const p = local(e)
    const box = { ...drag, x1: p.x, y1: p.y }
    setDrag(null)
    if (Math.abs(box.x1 - box.x0) > 6 && Math.abs(box.y1 - box.y0) > 6) {
      const ix = invertLinear(dom.x0, dom.x1, 0, pw)
      const iy = invertLinear(dom.y0, dom.y1, ph, 0)
      setView({ x0: Math.min(ix(box.x0), ix(box.x1)), x1: Math.max(ix(box.x0), ix(box.x1)), y0: Math.min(iy(box.y0), iy(box.y1)), y1: Math.max(iy(box.y0), iy(box.y1)) })
      return
    }
    const h = hit(p)
    if (h && h.dist <= HIT_RADIUS_PX) onScrub(h.i)
  }

  const hovered = hover ? { series: series[hover.s], i: hover.i } : null

  return (
    <div ref={boxRef} className="relative h-full w-full select-none">
      {size.w > 0 && (
        <svg
          ref={svgRef} width={size.w} height={size.h} className="touch-none"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)} onDoubleClick={() => setView(null)}
        >
          <defs><clipPath id="plot-clip"><rect x={0} y={0} width={pw} height={ph} /></clipPath></defs>
          <g transform={`translate(${M.l},${M.t})`}>
            {xTicks.map((t) => <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={0} y2={ph} className="stroke-border/50" />)}
            {yTicks.map((t) => <line key={`gy${t}`} x1={0} x2={pw} y1={sy(t)} y2={sy(t)} className="stroke-border/50" />)}
            <rect x={0} y={0} width={pw} height={ph} fill="none" className="stroke-border" />
            {xTicks.map((t) => <text key={`tx${t}`} x={sx(t)} y={ph + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">{formatTick(t)}</text>)}
            {yTicks.map((t) => <text key={`ty${t}`} x={-6} y={sy(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{formatTick(t)}</text>)}
            <text x={pw / 2} y={ph + 30} textAnchor="middle" className="fill-foreground text-[10px]">{xLabel}</text>
            <text transform={`translate(${-44},${ph / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground text-[10px]">{yLabel}</text>

            <g clipPath="url(#plot-clip)">
              {stageX.map((v, i) => <line key={`st${i}`} x1={sx(v)} x2={sx(v)} y1={0} y2={ph} strokeDasharray="3 3" className="stroke-muted-foreground/60" />)}
              {markerX !== null && <line x1={sx(markerX)} x2={sx(markerX)} y1={0} y2={ph} className="stroke-foreground/40" />}
              {series.map((s, k) => <path key={s.id} d={paths[k]} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round" />)}
              {step !== null && series.map((s) => step < s.x.length && Number.isFinite(s.x[step]) && Number.isFinite(s.y[step]) && (
                <circle key={`m${s.id}`} cx={sx(s.x[step])} cy={sy(s.y[step])} r={4} fill={s.color} stroke="white" strokeWidth={1.5} />
              ))}
              {hovered && <circle cx={sx(hovered.series.x[hovered.i])} cy={sy(hovered.series.y[hovered.i])} r={5} fill="none" stroke={hovered.series.color} strokeWidth={2} />}
            </g>
            {drag && <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} className="fill-primary/10 stroke-primary" />}
          </g>
        </svg>
      )}
      {hovered && (
        <div className="pointer-events-none absolute rounded border bg-background/95 px-1.5 py-1 text-[10px] shadow" style={{ left: Math.min(M.l + sx(hovered.series.x[hovered.i]) + 10, Math.max(0, size.w - 150)), top: Math.max(0, M.t + sy(hovered.series.y[hovered.i]) - 36) }}>
          <div className="font-medium" style={{ color: hovered.series.color }}>{hovered.series.label}</div>
          <div>step {hovered.i} · x {formatTick(hovered.series.x[hovered.i])} · y {formatTick(hovered.series.y[hovered.i])}</div>
        </div>
      )}
      {view && <button type="button" className="absolute right-1 top-1 rounded border bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted" onClick={() => setView(null)}>Reset zoom</button>}
    </div>
  )
}
