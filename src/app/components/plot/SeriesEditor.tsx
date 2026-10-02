import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { ChannelPicker } from './ChannelPicker'
import { seriesLabel, type AvailableTargets } from '@/app/lib/plot/channels'
import { useAppStore } from '@/app/store/useAppStore'
import type { SeriesSpec } from '@/app/types/plotView'

function SeriesRow({ series, targets, selectedNodeIds, sharedX, status }: {
  series: SeriesSpec
  targets: AvailableTargets
  selectedNodeIds: number[]
  sharedX: boolean
  status: 'ready' | 'nodata' | 'loading'
}) {
  const update = useAppStore((s) => s.updatePlotSeries)
  const remove = useAppStore((s) => s.removePlotSeries)
  const sharedXChannel = useAppStore((s) => s.plotView.x)
  const [open, setOpen] = useState(false)
  const label = seriesLabel(series.label, sharedX ? sharedXChannel : series.x, series.y)

  return (
    <div className="rounded border p-1">
      <div className="flex items-center gap-1">
        <Button type="button" size="icon" variant="ghost" className="size-5" onClick={() => setOpen(!open)}>{open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</Button>
        <input type="color" value={series.color} onChange={(e) => update(series.id, { color: e.target.value })} className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Series colour" />
        <Input
          key={series.label} defaultValue={series.label} placeholder={label} className="h-6 flex-1 text-[11px]"
          onBlur={(e) => { if (e.target.value !== series.label) update(series.id, { label: e.target.value }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        {status === 'nodata' && <span className="text-[10px] text-destructive">no data</span>}
        <Button type="button" size="icon" variant="ghost" className="size-5" onClick={() => update(series.id, { visible: !series.visible })}>{series.visible ? <Eye className="size-3" /> : <EyeOff className="size-3 text-muted-foreground" />}</Button>
        <Button type="button" size="icon" variant="ghost" className="size-5" onClick={() => remove(series.id)}><Trash2 className="size-3" /></Button>
      </div>
      {open && (
        <div className="mt-1 grid gap-1.5 pl-6">
          <div><Label className="text-[10px] text-muted-foreground">Y</Label><ChannelPicker value={series.y} onChange={(y) => update(series.id, { y })} targets={targets} selectedNodeIds={selectedNodeIds} /></div>
          {!sharedX && <div><Label className="text-[10px] text-muted-foreground">X</Label><ChannelPicker value={series.x} onChange={(x) => update(series.id, { x })} targets={targets} selectedNodeIds={selectedNodeIds} /></div>}
        </div>
      )}
    </div>
  )
}

/** The series list plus the shared-X control. */
export function SeriesEditor({ targets, statuses }: { targets: AvailableTargets; statuses: Map<string, 'ready' | 'nodata' | 'loading'> }) {
  const series = useAppStore((s) => s.plotView.series)
  const sharedX = useAppStore((s) => s.plotView.sharedX)
  const x = useAppStore((s) => s.plotView.x)
  const setPlotView = useAppStore((s) => s.setPlotView)
  const addPlotSeries = useAppStore((s) => s.addPlotSeries)
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds)

  return (
    <div className="grid gap-1.5 text-xs">
      <div className="flex items-center gap-2">
        <Label className="flex items-center gap-1.5 text-[11px] font-normal"><Checkbox checked={sharedX} onCheckedChange={(c) => setPlotView({ sharedX: Boolean(c) })} /> Shared X axis</Label>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-6 px-2 text-[11px]" disabled={!targets.disp.tags.length} onClick={() => addPlotSeries([{ y: { type: 'response', kind: 'disp', component: targets.disp.components[0] ?? 'dx', mode: 'single', tags: targets.disp.tags.slice(0, 1), scale: 1 } }])}>+ Series</Button>
      </div>
      {sharedX && <div><Label className="text-[10px] text-muted-foreground">X axis</Label><ChannelPicker value={x} onChange={(c) => setPlotView({ x: c })} targets={targets} selectedNodeIds={selectedNodeIds} /></div>}
      {series.map((s) => <SeriesRow key={s.id} series={s} targets={targets} selectedNodeIds={selectedNodeIds} sharedX={sharedX} status={statuses.get(s.id) ?? 'loading'} />)}
      {!series.length && <p className="text-[11px] text-muted-foreground">No series yet — pick a preset from the menu above, or add one.</p>}
    </div>
  )
}
