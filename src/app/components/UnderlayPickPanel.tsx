import { useState } from 'react'
import { useAppStore, type UnderlayPick } from '@/app/store/useAppStore'
import { useUnits } from '@/app/lib/units/useUnits'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Checkbox } from '@/app/components/ui/checkbox'

const TITLE: Record<UnderlayPick['kind'], string> = { calibrate: 'Calibrate scale', align: 'Align sheet', crop: 'Crop sheet' }

/** What the next click is for. */
function underlayPrompt(kind: UnderlayPick['kind'], n: number): string {
  if (kind === 'calibrate') return n === 0 ? 'Click the first end of a known dimension on the sheet.' : n === 1 ? 'Click the other end.' : 'Type the real distance between the two points.'
  if (kind === 'crop') return n === 0 ? 'Click one corner of the area to keep.' : 'Click the opposite corner.'
  return ['Click a point on the sheet (e.g. a grid intersection).', 'Click where it belongs in the model (snaps to grids and nodes).', 'Click a second point on the sheet, or Enter to just move.', 'Click where the second point belongs.'][n] ?? ''
}

/** The viewport panel for the underlay tool: the step prompt, the calibration distance and the align options. */
export function UnderlayPickPanel() {
  const pick = useAppStore((s) => s.underlayPick)
  const name = useAppStore((s) => s.underlays.find((u) => u.id === s.underlayPick?.id)?.name)
  const setKeepScale = useAppStore((s) => s.setUnderlayPickKeepScale)
  const apply = useAppStore((s) => s.applyUnderlayPick)
  const units = useUnits()
  const [text, setText] = useState('')
  if (!pick) return null
  const distance = units.parse('length', text)
  const cancel = () => useAppStore.getState().setActiveTool('select')
  return (
    <div className="h-full overflow-y-auto p-3 text-xs" data-hotkeys-ignore="true">
      <div className="font-medium">{TITLE[pick.kind]}<span className="font-normal text-muted-foreground"> · {name}</span></div>
      <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">{underlayPrompt(pick.kind, pick.points.length)}</p>
      {pick.kind === 'calibrate' && pick.points.length === 2 && (
        <form className="mb-1.5 flex gap-1" onSubmit={(e) => { e.preventDefault(); if (distance && distance > 0) apply(distance) }}>
          <Input autoFocus className="h-6 text-xs" value={text} placeholder={units.active ? `e.g. 24 ${units.symbol('length')}` : 'Distance'} onChange={(e) => setText(e.target.value)} aria-invalid={text !== '' && !(distance && distance > 0)} />
          <Button type="submit" size="sm" className="h-6 text-xs" disabled={!(distance && distance > 0)}>Apply</Button>
        </form>
      )}
      {pick.kind === 'align' && (
        <label className="mb-1.5 flex items-center gap-1.5"><Checkbox checked={pick.keepScale} onCheckedChange={(c) => setKeepScale(Boolean(c))} /> Keep the current scale (move and rotate only)</label>
      )}
      <div className="flex justify-end gap-1">
        {pick.kind === 'align' && pick.points.length === 2 && <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => apply()}>Move only</Button>}
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={cancel}>Cancel</Button>
      </div>
    </div>
  )
}
