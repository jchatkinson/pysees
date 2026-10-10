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
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { useModalResults } from '@/app/lib/resultsStorage/useModalResults'
import { useCurrentCase } from '@/app/lib/resultsStorage/useCases'
import type { CaseInfo } from '@/app/lib/resultsStorage/stepFrames'
import { usePlayback } from '@/app/lib/usePlayback'
import { useModeAnimation } from '@/app/lib/useModeAnimation'
import { modeFrequencyHz, modePeriod, modeTimingText, modeTranslationPeak } from '@/app/lib/modal'
import { autoModeScale, autoScale, modelMetrics } from '@/app/lib/resultsScale'
import type { RunExtents } from '@/app/types/resultsStorage'
import type { ResultType, ScaleKey } from '@/app/types/resultsView'
import { RAMP_CSS, SHELL_RESULTANTS, SHELL_RESULTANT_LABELS, type ShellResultant } from '@/app/lib/shellContour'
import { isShell } from '@/app/lib/commands/tables'

/** `only3d` types exist only in a 3D model; the 2D labels of V and M drop their axis suffix. */
const RESULT_TYPES: { id: ResultType; label: string; label3d?: string; only3d?: boolean }[] = [
  { id: 'none', label: 'None' },
  { id: 'deformed', label: 'Deformed shape' },
  { id: 'axial', label: 'Axial force (N)' },
  { id: 'shear', label: 'Shear force (V)', label3d: 'Shear force (Vy)' },
  { id: 'shearZ', label: 'Shear force (Vz)', only3d: true },
  { id: 'torsion', label: 'Torsion (T)', only3d: true },
  { id: 'moment', label: 'Bending moment (M)', label3d: 'Bending moment (Mz)' },
  { id: 'momentY', label: 'Bending moment (My)', only3d: true },
  { id: 'contour', label: 'Shell stress resultants', only3d: true },
  { id: 'mode', label: 'Mode shape' },
]
const DIRECTIONS = ['UX', 'UY', 'UZ']

const fmt = (v: number) => (v === 0 ? '0' : Number(v.toPrecision(4)).toString())
const caseLabel = (c: CaseInfo) => `${c.stageId} · ${c.kind === 'modal' ? 'modal' : `${Math.max(0, c.count - 1)} steps`}`

/** ETABS-style "Display Results" panel docked in the viewport: case, step, result type and display settings. */
export function ResultsDisplayPanel() {
  const rv = useAppStore((s) => s.resultsView)
  const set = useAppStore((s) => s.setResultsView)
  const model = useAppStore((s) => s.model)
  const is3d = model.config?.ndm === 3
  const hasShells = useMemo(() => [...model.elements.values()].some((e) => isShell(e.eleType)), [model.elements])
  const contourRange = useAppStore((s) => s.contourRange)

  const [extents, setExtents] = useState<{ runId: string; value: RunExtents } | null>(null)
  const [time, setTime] = useState<{ runId: string; step: number; value: number } | null>(null)

  const source = useResultsSource(rv.runId)
  // The selected case (analysis stage): steps, extents and playback are all scoped to its sample range.
  const { cases, current, series } = useCurrentCase()
  const count = series?.count ?? 0
  const first = series?.first ?? 0
  const lastStep = series ? series.first + series.count - 1 : 0
  usePlayback(first, lastStep)
  useModeAnimation()
  const modal = useModalResults(rv.runId)
  const modalStage = current?.kind === 'modal' ? modal?.stages.find((s) => s.stageIndex === current.stageIndex) : undefined
  const mode = modalStage?.modes[rv.mode] ?? modalStage?.modes[0]
  const isModalCase = current?.kind === 'modal'

  // Keep the result type valid for the case: modes for a modal case, steps' results otherwise.
  useEffect(() => {
    if (!current) return
    if (current.kind === 'modal' && rv.type !== 'mode' && rv.type !== 'none') set({ type: 'mode' })
    else if (current.kind !== 'modal' && rv.type === 'mode') set({ type: 'deformed' })
  }, [current, rv.type, set])

  useEffect(() => {
    if (!source || !series) return
    let live = true
    source.extents({ first: series.first, last: series.first + series.count - 1 }).then((value) => { if (live) setExtents({ runId: source.runId, value }) }).catch(() => {})
    return () => { live = false }
  }, [source, series])

  useEffect(() => {
    if (!source) return
    let live = true
    source.get(rv.step).then((f) => { if (live && f) setTime({ runId: source.runId, step: rv.step, value: f.pseudoTime }) }).catch(() => {})
    source.prefetch(rv.step, rv.playing ? Math.max(16, Math.ceil(rv.fps * 3)) : 8)
    return () => { live = false }
  }, [source, rv.step, rv.playing, rv.fps])

  const metrics = useMemo(() => modelMetrics(model), [model])
  const runExtents = extents && extents.runId === rv.runId ? extents.value : null
  // A contour is drawn on the deformed shape, so it shares that scale.
  const scaleKey: ScaleKey | null = rv.type === 'none' ? null : rv.type === 'contour' ? 'deformed' : rv.type
  const auto = !scaleKey ? 1 : scaleKey === 'mode' ? autoModeScale(modalStage && mode ? modeTranslationPeak(modalStage, mode) : 0, metrics) : autoScale(scaleKey, runExtents, metrics)
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

  const goto = (step: number) => set({ step: Math.min(lastStep, Math.max(first, step)), stepFrac: 0 })
  const rel = rv.step - first
  const selectCase = (stageIndex: number) => {
    const c = cases?.find((x) => x.stageIndex === stageIndex)
    if (!c) return
    set(c.kind === 'modal'
      ? { caseStage: stageIndex, playing: false, phase: 0, mode: 0, type: 'mode' }
      : { caseStage: stageIndex, playing: false, phase: 0, step: c.first + c.count - 1, stepFrac: 0, type: rv.type === 'mode' || rv.type === 'none' ? 'deformed' : rv.type })
  }
  const stepTime = time && time.runId === rv.runId && time.step === rv.step ? time.value : null

  return (
    <>
    {rv.type === 'mode' && mode && modalStage && (
      <div className="pointer-events-none absolute bottom-3 left-3 z-40 rounded-md bg-background/85 px-3 py-1.5 text-sm shadow">
        <span className="font-medium">Mode {Math.min(rv.mode, modalStage.modes.length - 1) + 1}</span> — {modeTimingText(mode)}
      </div>
    )}
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
            <Select items={(cases ?? []).map((c) => ({ value: String(c.stageIndex), label: caseLabel(c) }))} value={current ? String(current.stageIndex) : ''} onValueChange={(v) => selectCase(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="No results" /></SelectTrigger>
              <SelectContent>
                {(cases ?? []).map((c) => <SelectItem key={c.stageIndex} value={String(c.stageIndex)}>{caseLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-[11px]">Result</Label>
            <Select items={RESULT_TYPES.map((t) => ({ value: t.id, label: (is3d && t.label3d) || t.label }))} value={rv.type} onValueChange={(v) => set({ type: v as ResultType, phase: 0 })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{RESULT_TYPES.filter((t) => (!t.only3d || is3d) && (t.id !== 'contour' || hasShells) && (t.id === 'none' || (t.id === 'mode' ? isModalCase : !isModalCase))).map((t) => <SelectItem key={t.id} value={t.id}>{(is3d && t.label3d) || t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {rv.type === 'contour' && (
            <div className="grid gap-1.5">
              <Select items={SHELL_RESULTANTS.map((r) => ({ value: r, label: SHELL_RESULTANT_LABELS[r] }))} value={rv.contour} onValueChange={(v) => set({ contour: v as ShellResultant })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SHELL_RESULTANTS.map((r) => <SelectItem key={r} value={r}>{SHELL_RESULTANT_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
              <Label className="flex items-center gap-2 text-[11px] font-normal">
                <Checkbox checked={rv.contourDeformed} onCheckedChange={(c) => set({ contourDeformed: Boolean(c) })} /> Plot on deformed shape
              </Label>
              <div className="h-2.5 w-full rounded-sm" style={{ background: RAMP_CSS }} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{contourRange ? fmt(contourRange.min) : '–'}</span>
                <span>local axes, per unit length</span>
                <span>{contourRange ? fmt(contourRange.max) : '–'}</span>
              </div>
            </div>
          )}

          {rv.type === 'mode' && modalStage && (
            <div className="grid gap-2">
              <div className="grid gap-1">
                <Label className="text-[11px]">Mode</Label>
                <Select items={modalStage.modes.map((m, i) => ({ value: String(i), label: `${i + 1} · T = ${fmt(modePeriod(m.frequency))} s · f = ${fmt(modeFrequencyHz(m.frequency))} Hz` }))} value={String(rv.mode)} onValueChange={(v) => set({ mode: Number(v), phase: 0 })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{modalStage.modes.map((m, i) => <SelectItem key={i} value={String(i)}>{i + 1} · T = {fmt(modePeriod(m.frequency))} s · f = {fmt(modeFrequencyHz(m.frequency))} Hz</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {mode && (
                <div className="grid gap-0.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px]">
                  <span className="font-medium">Mode {Math.min(rv.mode, modalStage.modes.length - 1) + 1}: {modeTimingText(mode)}</span>
                  <span className="text-muted-foreground">ω = {fmt(mode.frequency)} rad/s · mass ratio {mode.massRatio.map((r, d) => `${DIRECTIONS[d]} ${(r * 100).toFixed(1)}%`).join(' · ')}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="size-7" onClick={() => set({ playing: !rv.playing })}>{rv.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
                <Label className="w-12 shrink-0 text-[11px]">Speed</Label>
                <Input
                  key={rv.modeSpeed}
                  defaultValue={String(rv.modeSpeed)}
                  className="h-7 flex-1 text-xs"
                  onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== rv.modeSpeed) set({ modeSpeed: Math.min(v, 10) }) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
                <span className="text-[10px] text-muted-foreground">cycles/s</span>
              </div>
            </div>
          )}

          {rv.type !== 'mode' && <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Step</Label>
              <span className="text-[10px] text-muted-foreground">{count ? `${rel} / ${lastStep - first}` : '–'}{count > 0 && rel === 0 && ' (initial)'}{stepTime !== null && ` · t = ${fmt(stepTime)}`}</span>
            </div>
            <Slider value={[Math.min(rv.step + rv.stepFrac, lastStep)]} min={first} max={Math.max(first + 1, lastStep)} step={0.01} disabled={count < 2} className="w-full" onValueChange={(v) => goto(Math.round((Array.isArray(v) ? v[0] : v) ?? 0))} />
            <div className="flex items-center justify-center gap-1">
              <Button size="icon" variant="ghost" className="size-6" disabled={!count} onClick={() => goto(first)}><ChevronsLeft className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={!count} onClick={() => goto(rv.step - 1)}><ChevronLeft className="size-3.5" /></Button>
              <Button size="icon" variant="outline" className="size-7" disabled={count < 2} onClick={() => set({ playing: !rv.playing })}>{rv.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={!count} onClick={() => goto(rv.step + 1)}><ChevronRight className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-6" disabled={!count} onClick={() => goto(lastStep)}><ChevronsRight className="size-3.5" /></Button>
            </div>
          </div>}

          <div className="grid gap-2 border-t pt-2">
            <div className="flex items-center gap-2">
              <Label className="w-12 shrink-0 text-[11px]">Scale</Label>
              <Input
                key={`${scaleKey}-${scale}`}
                defaultValue={fmt(scale)}
                disabled={!scaleKey || (rv.type === 'contour' && !rv.contourDeformed)}
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
    </>
  )
}
