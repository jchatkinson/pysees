import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, GripHorizontal, Maximize2, Minimize2, SlidersHorizontal, X, ChevronDown } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/app/components/ui/dropdown-menu'
import { useAppStore } from '@/app/store/useAppStore'
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { usePlotData } from '@/app/lib/plot/usePlotData'
import { availableTargets, describeChannel, seriesLabel } from '@/app/lib/plot/channels'
import { PLOT_PRESETS, selectedNodeSeries } from '@/app/lib/plot/presets'
import { downloadCsv, seriesToCsv } from '@/app/lib/plot/csv'
import { PlotChart, type ChartSeries } from './PlotChart'
import { SeriesEditor } from './SeriesEditor'

const MARGIN = 12
const RESULTS_PANEL_WIDTH = 300 // keep clear of the Display Results panel when defaulting to top-right
const MIN_W = 320
const MIN_H = 240

type Geometry = { x: number; y: number; w: number; h: number }

/**
 * Floating, draggable, resizable x-y plot of recorded results (any response vs any response, step or time).
 * Portalled to `document.body` and positioned in window coordinates so it can sit over the whole app, not just
 * the viewport; the viewport's top-right corner is only where it starts.
 */
export function PlotOverlay() {
  const pv = useAppStore((s) => s.plotView)
  const setPlotView = useAppStore((s) => s.setPlotView)
  const addPlotSeries = useAppStore((s) => s.addPlotSeries)
  const model = useAppStore((s) => s.model)
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds)
  const runId = useAppStore((s) => s.resultsView.runId)
  const step = useAppStore((s) => s.resultsView.step)
  const resultsOpen = useAppStore((s) => s.resultsView.open)
  const setResultsView = useAppStore((s) => s.setResultsView)

  const source = useResultsSource(runId)
  const targets = useMemo(() => availableTargets(source?.layout ?? null), [source])
  const data = usePlotData(source, pv.series, pv.sharedX, pv.x)

  const anchorRef = useRef<HTMLSpanElement>(null)
  // Window size, and the viewport's top-right corner in window coordinates (the default position).
  const [parent, setParent] = useState({ w: 0, h: 0 })
  const [corner, setCorner] = useState({ right: 0, top: 0 })
  const [live, setLive] = useState<Geometry | null>(null)

  useEffect(() => {
    const host = anchorRef.current?.parentElement
    const measure = () => {
      setParent({ w: window.innerWidth, h: window.innerHeight })
      const r = host?.getBoundingClientRect()
      if (r) setCorner({ right: r.right, top: r.top })
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = host ? new ResizeObserver(measure) : null
    if (host) ro?.observe(host)
    return () => { window.removeEventListener('resize', measure); ro?.disconnect() }
  }, [pv.open])

  const statuses = useMemo(() => {
    const m = new Map<string, 'ready' | 'nodata' | 'loading'>()
    for (const s of pv.series) {
      const v = data.values.get(s.id)
      m.set(s.id, !v ? 'loading' : v.x && v.y ? 'ready' : 'nodata')
    }
    return m
  }, [pv.series, data.values])

  const chartSeries = useMemo<ChartSeries[]>(() => pv.series.flatMap((s) => {
    const v = data.values.get(s.id)
    return s.visible && v?.x && v.y ? [{ id: s.id, color: s.color, label: seriesLabel(s.label, pv.sharedX ? pv.x : s.x, s.y), x: v.x, y: v.y }] : []
  }), [pv.series, pv.sharedX, pv.x, data.values])

  const visibleSpecs = pv.series.filter((s) => s.visible)
  const xChannel = pv.sharedX ? pv.x : visibleSpecs[0]?.x
  const xLabel = pv.sharedX ? describeChannel(pv.x) : visibleSpecs.length === 1 ? describeChannel(visibleSpecs[0].x) : 'X'
  const yLabel = visibleSpecs.length === 1 ? describeChannel(visibleSpecs[0].y)
    : visibleSpecs.length > 1 && visibleSpecs.every((s) => s.y.type === 'response' && visibleSpecs[0].y.type === 'response' && s.y.kind === visibleSpecs[0].y.kind && s.y.component === visibleSpecs[0].y.component) ? (visibleSpecs[0].y.type === 'response' ? visibleSpecs[0].y.component : '')
    : 'Value'

  const timeline = data.timeline
  const markerX = pv.showStepMarker && pv.sharedX ? (pv.x.type === 'step' ? step : pv.x.type === 'time' ? timeline?.pseudoTime[step] ?? null : null) : null
  const stageX = useMemo(() => {
    if (!pv.showStageTicks || !pv.sharedX || !timeline || (pv.x.type !== 'step' && pv.x.type !== 'time')) return []
    const out: number[] = []
    for (let i = 1; i < timeline.stage.length; i++) if (timeline.stage[i] !== timeline.stage[i - 1]) out.push(pv.x.type === 'step' ? i : timeline.pseudoTime[i])
    return out
  }, [pv.showStageTicks, pv.sharedX, pv.x.type, timeline])

  if (!pv.open) return <span ref={anchorRef} hidden />

  const base: Geometry = pv.maximized
    ? { x: MARGIN, y: MARGIN, w: Math.max(MIN_W, parent.w - 2 * MARGIN), h: Math.max(MIN_H, parent.h - 2 * MARGIN) }
    : { x: pv.pos?.x ?? corner.right - pv.size.w - MARGIN - (resultsOpen ? RESULTS_PANEL_WIDTH : 0), y: pv.pos?.y ?? corner.top + MARGIN, w: pv.size.w, h: pv.size.h }
  const g = live ?? base
  const clamp = (v: Geometry): Geometry => ({
    ...v,
    x: Math.min(Math.max(v.x, 60 - v.w), Math.max(0, parent.w - 60)),
    y: Math.min(Math.max(v.y, 0), Math.max(0, parent.h - 30)),
  })

  const startDrag = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0 || pv.maximized || (e.target as HTMLElement).closest('button,input,[role="menuitem"]')) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const start = { px: e.clientX, py: e.clientY, g: base }
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px
      const dy = ev.clientY - start.py
      setLive(kind === 'move' ? clamp({ ...start.g, x: start.g.x + dx, y: start.g.y + dy }) : { ...start.g, w: Math.max(MIN_W, start.g.w + dx), h: Math.max(MIN_H, start.g.h + dy) })
    }
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      const dx = ev.clientX - start.px
      const dy = ev.clientY - start.py
      if (kind === 'move') { const moved = clamp({ ...start.g, x: start.g.x + dx, y: start.g.y + dy }); setPlotView({ pos: { x: moved.x, y: moved.y } }) }
      else setPlotView({ pos: { x: start.g.x, y: start.g.y }, size: { w: Math.max(MIN_W, start.g.w + dx), h: Math.max(MIN_H, start.g.h + dy) } })
      setLive(null)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const presetCtx = { targets, model, selectedNodeIds }
  const applyPreset = (id: string) => {
    const built = PLOT_PRESETS.find((p) => p.id === id)?.build(presetCtx)
    if (!built) return
    setPlotView({ x: built.x, sharedX: true })
    addPlotSeries(built.series.map((s) => ({ y: s.y, x: built.x })), true)
  }
  const addSelected = () => { const specs = selectedNodeSeries(presetCtx); if (specs.length) addPlotSeries(specs.map((s) => ({ ...s, x: pv.x }))) }
  const exportCsv = () => downloadCsv('results-plot.csv', seriesToCsv(chartSeries))

  const panel = (
    <div
      className="fixed z-[45] flex flex-col overflow-hidden rounded-md border bg-background shadow-lg"
      style={{ left: g.x, top: g.y, width: g.w, height: g.h, visibility: parent.w && corner.right ? 'visible' : 'hidden' }}
    >
      <div className="flex shrink-0 cursor-grab items-center gap-1 border-b bg-muted/40 px-2 py-1 active:cursor-grabbing" onPointerDown={startDrag('move')}>
        <GripHorizontal className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Plot</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="ml-2 h-6 gap-1 px-2 text-[11px]">Presets <ChevronDown className="size-3" /></Button>} />
          <DropdownMenuContent>
            {PLOT_PRESETS.map((p) => <DropdownMenuItem key={p.id} disabled={!source || !p.build(presetCtx)} onClick={() => applyPreset(p.id)}>{p.label}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!selectedNodeSeries(presetCtx).length} onClick={addSelected}>Add selected nodes (displacement)</DropdownMenuItem>
            <DropdownMenuItem disabled={!pv.series.length} onClick={() => addPlotSeries([], true)}>Clear series</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-0.5">
          <Button type="button" size="icon" variant="ghost" className="size-6" title="Export CSV" disabled={!chartSeries.length} onClick={exportCsv}><Download className="size-3.5" /></Button>
          <Button type="button" size="icon" variant={pv.showEditor ? 'secondary' : 'ghost'} className="size-6" title="Series editor" onClick={() => setPlotView({ showEditor: !pv.showEditor })}><SlidersHorizontal className="size-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="size-6" title={pv.maximized ? 'Restore' : 'Maximize'} onClick={() => setPlotView({ maximized: !pv.maximized })}>{pv.maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</Button>
          <Button type="button" size="icon" variant="ghost" className="size-6" title="Close" onClick={() => setPlotView({ open: false })}><X className="size-3.5" /></Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 p-1">
        {!runId || !source ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">{runId ? 'Loading results…' : 'Run an analysis to plot results.'}</div>
        ) : chartSeries.length ? (
          <PlotChart
            series={chartSeries} xLabel={xLabel} yLabel={yLabel} step={pv.showStepMarker ? step : null}
            markerX={markerX} stageX={stageX} onScrub={(i) => setResultsView({ step: i, stepFrac: 0, playing: false })}
          />
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">{data.loading ? 'Loading…' : pv.series.length ? (xChannel ? 'No visible series with data for this run.' : 'No visible series.') : 'Add a series or choose a preset.'}</div>
        )}
      </div>

      {pv.showEditor && (
        <div className="max-h-[50%] shrink-0 overflow-y-auto border-t p-2">
          <SeriesEditor targets={targets} statuses={statuses} />
        </div>
      )}
      {!pv.maximized && <div className="absolute bottom-0 right-0 size-3 cursor-nwse-resize" onPointerDown={startDrag('resize')} style={{ background: 'linear-gradient(135deg, transparent 50%, var(--color-border) 50%)' }} />}
    </div>
  )

  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(panel, document.body)}
    </>
  )
}
