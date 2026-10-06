import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { useAppStore } from '@/app/store/useAppStore'
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { channelTerms } from '@/app/lib/plot/channels'
import { samePlot, snapshotPlot, summarizePlot } from '@/app/lib/plot/savedPlots'
import type { PlotConfig } from '@/app/types/savedPlot'
import type { StepFrameSource } from '@/app/lib/resultsStorage/stepFrames'

/** Series whose channels the current run has no recorded data for (tags removed, recorders changed). */
const missingSeries = (config: PlotConfig, source: StepFrameSource) =>
  config.series.filter((s) => channelTerms(s.y, source.layout) === null || channelTerms(config.sharedX ? config.x : s.x, source.layout) === null).length

/** Saved plot configurations. Only the configuration is stored; clicking an entry re-plots it against the current run. */
export function ReportPanel() {
  const plots = useAppStore((s) => s.savedPlots)
  const activeId = useAppStore((s) => s.activeSavedPlotId)
  const plotView = useAppStore((s) => s.plotView)
  const runId = useAppStore((s) => s.resultsView.runId)
  const apply = useAppStore((s) => s.applySavedPlot)
  const rename = useAppStore((s) => s.renameSavedPlot)
  const remove = useAppStore((s) => s.deleteSavedPlot)
  const update = useAppStore((s) => s.updateSavedPlot)
  const source = useResultsSource(runId)
  const [editing, setEditing] = useState<number | null>(null)
  const current = useMemo(() => snapshotPlot(plotView), [plotView])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Report</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{plots.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-0.5 py-0.5">
            {!plots.length && <p className="px-3 py-6 text-center text-[10px] text-muted-foreground">No saved plots. Use the save icon in a plot's header to keep its configuration here.</p>}
            {plots.map((p) => {
              const missing = source ? missingSeries(p.config, source) : 0
              const modified = p.id === activeId && plotView.open && !samePlot(p.config, current)
              return (
                <div key={p.id} className={`group flex items-start gap-1 rounded px-1.5 py-1 hover:bg-accent ${p.id === activeId ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : ''}`}>
                  {editing === p.id ? (
                    <input
                      autoFocus defaultValue={p.name} className="h-5 min-w-0 flex-1 rounded border bg-background px-1 text-[11px]"
                      onBlur={(e) => { rename(p.id, e.target.value); setEditing(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null) }}
                    />
                  ) : (
                    <button className="min-w-0 flex-1 text-left" onClick={() => apply(p.id)} onDoubleClick={() => setEditing(p.id)} title="Click to plot · double-click to rename">
                      <div className="flex items-center gap-1 text-[11px] leading-4">
                        <span className="truncate">{p.name}</span>
                        {modified && <span className="shrink-0 text-[9px] text-muted-foreground">· modified</span>}
                        {missing > 0 && <span title={`${missing} series have no data in the current run`}><AlertTriangle className="size-3 shrink-0 text-destructive" /></span>}
                      </div>
                      <div className="truncate text-[10px] leading-3 text-muted-foreground">{summarizePlot(p.config)}</div>
                    </button>
                  )}
                  {modified && <button className="shrink-0 rounded px-1 text-[10px] text-primary hover:underline" onClick={() => update(p.id)} title="Overwrite this entry with the open plot">Update</button>}
                  <button className="shrink-0 p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100" title="Rename" onClick={() => setEditing(p.id)}><Pencil className="size-3" /></button>
                  <button className="shrink-0 p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" title="Delete" onClick={() => remove(p.id)}><Trash2 className="size-3" /></button>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
