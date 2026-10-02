import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChartLine, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore } from '@/app/store/useAppStore'
import { listRuns } from '@/app/lib/resultsStorage/resultsStorageClient'
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { usePlayback } from '@/app/lib/usePlayback'
import { autoScale, modelMetrics } from '@/app/lib/resultsScale'
import type { RunExtents, RunMetadata } from '@/app/types/resultsStorage'
import type { ResultType, ScaleKey } from '@/app/types/resultsView'

const RESULT_TYPES: { id: ResultType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'deformed', label: 'Deformed shape' },
  { id: 'axial', label: 'Axial force (N)' },
  { id: 'shear', label: 'Shear force (V)' },
  { id: 'moment', label: 'Bending moment (M)' },
]

const fmt = (v: number) => (v === 0 ? '0' : Number(v.toPrecision(4)).toString())
const shortRun = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id)

/** ETABS-style "Display Results" panel docked in the viewport: case, step, result type and display settings. */
export function ResultsDisplayPanel() {
  const rv = useAppStore((s) => s.resultsView)
  const set = useAppStore((s) => s.setResultsView)
  const model = useAppStore((s) => s.model)
  const runStatus = useAppStore((s) => s.carapaceRun.status)

  const [runs, setRuns] = useState<RunMetadata[]>([])
  const [extents, setExtents] = useState<{ runId: string; value: RunExtents } | null>(null)
  const [time, setTime] = useState<{ runId: string; step: number; value: number } | null>(null)

  const source = useResultsSource(rv.runId)
  const sampleCount = source?.sampleCount ?? 0
  usePlayback(sampleCount)

  useEffect(() => {
    let live = true
    listRuns().then((r) => { if (live) setRuns(r.runs.filter((x) => x.sampleCount > 0).sort((a, b) => b.startedAt - a.startedAt)) }).catch(() => {})
    return () => { live = false }
  }, [runStatus])

  useEffect(() => {
    if (!source) return
    let live = true
    source.extents().then((value) => { if (live) setExtents({ runId: source.runId, value }) }).catch(() => {})
    return () => { live = false }
  }, [source])

  useEffect(() => {
    if (!source) return
    let live = true
    source.get(rv.step).then((f) => { if (live && f) setTime({ runId: source.runId, step: rv.step, value: f.pseudoTime }) }).catch(() => {})
    source.prefetch(rv.step, rv.playing ? Math.max(16, Math.ceil(rv.fps * 3)) : 8)
    return () => { live = false }
  }, [source, rv.step, rv.playing, rv.fps])

  const metrics = useMemo(() => modelMetrics(model), [model])
  const runExtents = extents && extents.runId === rv.runId ? extents.value : null
  const scaleKey: ScaleKey | null = rv.type === 'none' ? null : rv.type
  const auto = scaleKey ? autoScale(scaleKey, runExtents, metrics) : 1
  const manual = scaleKey ? rv.scales[scaleKey] : null
  const scale = manual ?? auto
  const plotOpen = useAppStore((s) => s.plotView.open)
  const setPlotView = useAppStore((s) => s.setPlotView)
  const setScale = (value: number | null) => scaleKey && set({ scales: { ...rv.scales, [scaleKey]: value } })

  if (!rv.open) {
    return rv.runId ? (
      <div className="absolute right-3 top-3 z-40 flex gap-1">
        <Button size="sm" variant="outline" className="gap-1 bg-background/90" onClick={() => set({ open: true })}><BarChart3 className="size-3.5" /> Results</Button>
        <Button size="sm" variant={plotOpen ? 'secondary' : 'outline'} className="gap-1 bg-background/90" onClick={() => setPlotView({ open: !plotOpen })}><ChartLine className="size-3.5" /> Plot</Button>
      </div>
    ) : null
  }

  const lastStep = Math.max(0, sampleCount - 1)
  const goto = (step: number) => set({ step: Math.min(lastStep, Math.max(0, step)), stepFrac: 0 })
  const stepTime = time && time.runId === rv.runId && time.step === rv.step ? time.value : null

  return (
    <div className="absolute right-3 top-3 z-40 w-72 max-w-[calc(100%-1.5rem)]">
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Display Results</CardTitle>
            <div className="flex items-center">
              <Button size="icon" variant={plotOpen ? 'secondary' : 'ghost'} className="size-6" title="Plot results" onClick={() => setPlotView({ open: !plotOpen })}><ChartLine className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => set({ open: false, playing: false })}><X className="size-3.5" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs">
          <div className="grid gap-1">
            <Label className="text-[11px]">Case</Label>
            <Select value={rv.runId ?? ''} onValueChange={(v) => set({ runId: (v as string) || null, step: 0, stepFrac: 0, playing: false })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="No stored runs" /></SelectTrigger>
              <SelectContent>
                {runs.map((r) => <SelectItem key={r.runId} value={r.runId}>{shortRun(r.runId)} · {r.status} · {r.sampleCount} steps</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-[11px]">Result</Label>
            <Select value={rv.type} onValueChange={(v) => set({ type: v as ResultType })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{RESULT_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Step</Label>
              <span className="text-[10px] text-muted-foreground">{sampleCount ? `${rv.step} / ${lastStep}` : '–'}{stepTime !== null && ` · t = ${fmt(stepTime)}`}</span>
            </div>
            <Slider value={[Math.min(rv.step + rv.stepFrac, lastStep)]} min={0} max={Math.max(1, lastStep)} step={0.01} disabled={sampleCount < 2} className="w-full" onValueChange={(v) => goto(Math.round((Array.isArray(v) ? v[0] : v) ?? 0))} />
            <div className="flex items-center justify-center gap-1">
              <Button size="icon" variant="ghost" className="size-6" disabled={!sampleCount} onClick={() => goto(0)}><ChevronsLeft className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={!sampleCount} onClick={() => goto(rv.step - 1)}><ChevronLeft className="size-3.5" /></Button>
              <Button size="icon" variant="outline" className="size-7" disabled={sampleCount < 2} onClick={() => set({ playing: !rv.playing })}>{rv.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={!sampleCount} onClick={() => goto(rv.step + 1)}><ChevronRight className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={!sampleCount} onClick={() => goto(lastStep)}><ChevronsRight className="size-3.5" /></Button>
            </div>
          </div>

          <div className="grid gap-2 border-t pt-2">
            <div className="flex items-center gap-2">
              <Label className="w-12 shrink-0 text-[11px]">Scale</Label>
              <Input
                key={`${scaleKey}-${scale}`}
                defaultValue={fmt(scale)}
                disabled={!scaleKey}
                className="h-7 flex-1 text-xs"
                onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== scale) setScale(v) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <Label className="flex items-center gap-1 text-[11px] font-normal">
                <Checkbox checked={manual === null} disabled={!scaleKey} onCheckedChange={(c) => setScale(c ? null : auto)} /> Auto
              </Label>
            </div>
            <Label className="flex items-center gap-2 text-[11px] font-normal">
              <Checkbox checked={rv.showUndeformed} onCheckedChange={(c) => set({ showUndeformed: Boolean(c) })} /> Show undeformed wireframe
            </Label>
            <Label className="flex items-center gap-2 text-[11px] font-normal">
              <Checkbox checked={rv.fillDiagrams} onCheckedChange={(c) => set({ fillDiagrams: Boolean(c) })} /> Fill diagrams
            </Label>
            <div className="flex items-center gap-2">
              <Label className="w-12 shrink-0 text-[11px]">Speed</Label>
              <Input
                key={rv.fps}
                defaultValue={String(rv.fps)}
                className="h-7 flex-1 text-xs"
                onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== rv.fps) set({ fps: Math.min(v, 120) }) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <span className="text-[10px] text-muted-foreground">steps/s</span>
            </div>
            <Label className="flex items-center gap-2 text-[11px] font-normal">
              <Checkbox checked={rv.loop} onCheckedChange={(c) => set({ loop: Boolean(c) })} /> Loop playback
            </Label>
            <Label className="flex items-center gap-2 text-[11px] font-normal">
              <Checkbox checked={rv.smooth} onCheckedChange={(c) => set({ smooth: Boolean(c), stepFrac: 0 })} /> Smooth (interpolate between steps)
            </Label>
            <Label className="flex items-center gap-2 text-[11px] font-normal">
              <Checkbox checked={rv.showValues} onCheckedChange={(c) => set({ showValues: Boolean(c) })} /> Show values
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
