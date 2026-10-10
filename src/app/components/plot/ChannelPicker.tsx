import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { KIND_LABELS, TARGET_LABELS, type AvailableTargets } from '@/app/lib/plot/channels'
import type { Channel, ResponseKind } from '@/app/types/plotView'

type TypeId = 'step' | 'time' | ResponseKind
type Response = Extract<Channel, { type: 'response' }>

const MODES: { id: Response['mode']; label: string }[] = [
  { id: 'single', label: 'Single (as is)' },
  { id: 'sum', label: 'Sum (Σ)' },
  { id: 'difference', label: 'Difference (A − B)' },
]

function defaultResponse(kind: ResponseKind, targets: AvailableTargets): Response {
  const t = targets[kind]
  return { type: 'response', kind, component: t.components[0] ?? '', mode: 'single', tags: t.tags.slice(0, 1), scale: 1 }
}

const parseTags = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number)
function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid min-w-0 content-start gap-0.5 ${className}`}>
      <span className="text-[10px] font-medium text-muted-foreground">{label}{hint && <span className="ml-1 font-normal opacity-70">· {hint}</span>}</span>
      {children}
    </div>
  )
}

const tagText = (tags: number[]) => tags.join(', ')

/**
 * Edits one axis quantity: step, pseudo-time, or a recorded response (displacement, reaction, element
 * force) as a single target, a sum over several, or a difference of two, with a scale factor.
 */
export function ChannelPicker({ value, onChange, targets, selectedNodeIds }: {
  value: Channel
  onChange: (c: Channel) => void
  targets: AvailableTargets
  selectedNodeIds: number[]
}) {
  const typeId: TypeId = value.type === 'response' ? value.kind : value.type
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null)

  const setType = (id: TypeId) => {
    if (id === 'step' || id === 'time') onChange({ type: id })
    else onChange(defaultResponse(id, targets))
  }
  const typeOptions: { id: TypeId; label: string; disabled?: boolean }[] = [
    { id: 'step', label: 'Step' },
    { id: 'time', label: 'Pseudo-time' },
    ...(['disp', 'vel', 'accel', 'reaction', 'force'] as const).map((k) => ({ id: k, label: KIND_LABELS[k], disabled: targets[k].tags.length === 0 })),
  ]

  if (value.type !== 'response') {
    return (
      <div className="@container grid gap-1">
        <Field label="Quantity">
          <Select value={typeId} onValueChange={(v) => setType(v as TypeId)}>
            <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{typeOptions.map((o) => <SelectItem key={o.id} value={o.id} disabled={o.disabled}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
    )
  }

  const t = targets[value.kind]
  const need = value.mode === 'single' ? 1 : value.mode === 'difference' ? 2 : 1
  const patch = (p: Partial<Response>) => onChange({ ...value, ...p })
  const setMode = (mode: Response['mode']) => {
    const tags = mode === 'single' ? value.tags.slice(0, 1) : mode === 'difference' ? [value.tags[0] ?? t.tags[0], value.tags[1] ?? t.tags[1] ?? t.tags[0]] : value.tags
    patch({ mode, tags: tags.filter((x) => x !== undefined) })
  }
  const known = new Set(t.tags)
  const text = draft?.key === JSON.stringify(value.tags) ? draft.text : tagText(value.tags)
  const parsed = parseTags(text)
  const valid = parsed.length >= need && (value.mode === 'sum' || parsed.length === need) && parsed.every((x) => Number.isInteger(x) && known.has(x))
  const commit = () => { if (valid) patch({ tags: parsed }); setDraft(null) }
  const selected = selectedNodeIds.filter((id) => known.has(id))
  const target = TARGET_LABELS[value.kind]
  const idsLabel = value.mode === 'difference' ? `${target} IDs (A, B)` : value.mode === 'sum' ? `${target} IDs (summed)` : `${target} ID`
  const idsHint = value.mode === 'difference' ? 'Plots A − B: two IDs, comma separated' : value.mode === 'sum' ? 'Comma or space separated' : undefined

  return (
    <div className="@container">
    <div className="grid grid-cols-2 gap-1.5 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto]">
        <Field label="Quantity">
          <Select value={typeId} onValueChange={(v) => setType(v as TypeId)}>
            <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{typeOptions.map((o) => <SelectItem key={o.id} value={o.id} disabled={o.disabled}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Component">
          <Select value={value.component} onValueChange={(v) => patch({ component: v as string })}>
            <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{t.components.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      <Field label={idsLabel} hint={idsHint} className="col-span-2 @xl:col-span-1">
        <div className="flex items-center gap-1">
          <Input
            value={text} onChange={(e) => setDraft({ key: JSON.stringify(value.tags), text: e.target.value })}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            aria-invalid={!valid} className="h-7 flex-1 text-xs"
          />
          {value.mode === 'sum' && <Button type="button" variant="outline" size="sm" className="h-7 px-1.5 text-[10px]" title={`Use every ${target.toLowerCase()}`} onClick={() => patch({ tags: t.tags })}>All</Button>}
          {value.kind !== 'force' && <Button type="button" variant="outline" size="sm" className="h-7 px-1.5 text-[10px]" title="Use the nodes selected in the viewport" disabled={!selected.length || (value.mode === 'difference' && selected.length !== 2) || (value.mode === 'single' && selected.length < 1)} onClick={() => patch({ tags: value.mode === 'single' ? selected.slice(0, 1) : selected })}>Use selection</Button>}
        </div>
      </Field>
        <Field label="Combine">
          <Select value={value.mode} onValueChange={(v) => setMode(v as Response['mode'])}>
            <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Multiply by">
          <div className="flex items-center gap-1">
            <Input
              key={value.scale} defaultValue={String(value.scale)} className="h-7 w-16 text-xs"
              onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== 0 && v !== value.scale) patch({ scale: v }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
            <Button type="button" variant="outline" size="sm" className="h-7 px-1.5 text-[10px]" title="Flip sign" onClick={() => patch({ scale: -value.scale })}>±</Button>
          </div>
        </Field>
    </div>
    </div>
  )
}
