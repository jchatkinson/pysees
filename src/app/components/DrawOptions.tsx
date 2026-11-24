import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore, type ToolId } from '@/app/store/useAppStore'
import { deriveProperties, sectionName, templateKey, templateName, type DrawTemplate } from '@/app/lib/editor/properties'
import { isFrameTemplate } from '@/app/lib/editor/draw'
import { useUnits } from '@/app/lib/units/useUnits'
import type { Category } from '@/app/lib/units/units'

const HINTS: Record<Exclude<ToolId, 'select'>, string> = {
  frame: 'Click points to draw members. Right-click or Enter ends the chain; Esc leaves the tool. Shift locks to an axis.',
  quickBeam: 'Click a grid bay to place a beam on it.',
  quickColumn: 'Plan: click a grid intersection (column from the story below). Elevation: click a bay between levels.',
  support: 'Click a node to give it this support.',
}
const TITLES: Record<Exclude<ToolId, 'select'>, string> = { frame: 'Draw frame', quickBeam: 'Quick beams', quickColumn: 'Quick columns', support: 'Supports' }

type NewKind = 'ElasticBeamColumn' | 'DispBeamColumn' | 'Truss'
const ELASTIC_FIELDS: { key: string; cat: Category; only3d?: boolean }[] = [
  { key: 'A', cat: 'area' }, { key: 'E', cat: 'stress' }, { key: 'G', cat: 'stress', only3d: true }, { key: 'J', cat: 'inertia', only3d: true },
  { key: 'Iy', cat: 'inertia', only3d: true }, { key: 'Iz', cat: 'inertia' },
]

/** A new frame property to draw with: an elastic member, a fiber member through an existing integration, or a truss. */
function NewProperty({ onDone }: { onDone: (t: DrawTemplate) => void }) {
  const model = useAppStore((s) => s.model)
  const ndm = model.config?.ndm ?? 3
  const units = useUnits()
  const [kind, setKind] = useState<NewKind>('ElasticBeamColumn')
  const [text, setText] = useState<Record<string, string>>({})
  const [ref, setRef] = useState('')
  const field = (key: string, cat: Category) => (
    <label key={key} className="grid grid-cols-[2.5rem_1fr] items-center gap-1">
      <span>{key}</span>
      <Input className="h-6 text-xs" value={text[key] ?? ''} placeholder={units.active ? units.symbol(cat) : ''} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
    </label>
  )
  const parsed = (fields: { key: string; cat: Category }[]) => {
    const out: Record<string, number> = {}
    for (const f of fields) { const v = units.parse(f.cat, text[f.key] ?? ''); if (v === null || !(v > 0)) return null; out[f.key] = v }
    return out
  }
  const elastic = ELASTIC_FIELDS.filter((f) => !f.only3d || ndm === 3)
  const template: DrawTemplate | null = kind === 'ElasticBeamColumn' ? (() => { const a = parsed(elastic); return a && { eleType: kind, args: a } })()
    : kind === 'Truss' ? (() => { const a = parsed([{ key: 'A', cat: 'area' }]); return a && ref ? { eleType: kind, args: { A: a.A, matTag: Number(ref) } } : null })()
    : ref ? { eleType: kind, args: { integrationTag: Number(ref) } } : null
  const refs = kind === 'DispBeamColumn'
    ? [...model.beamIntegrations.values()].map((b) => ({ value: String(b.id), label: `${b.intType} · ${sectionName(model, b.args.secTag)}` }))
    : kind === 'Truss' ? [...model.materials.values()].filter((m) => m.kind === 'uniaxial').map((m) => ({ value: String(m.id), label: `${m.matType} M${m.id}` })) : []
  return (
    <div className="grid gap-1.5 border-t pt-1.5">
      <Select items={[{ value: 'ElasticBeamColumn', label: 'Elastic beam-column' }, { value: 'DispBeamColumn', label: 'Fiber beam-column (disp)' }, { value: 'Truss', label: 'Truss' }]} value={kind} onValueChange={(v) => { if (v) { setKind(v as NewKind); setRef('') } }}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ElasticBeamColumn">Elastic beam-column</SelectItem>
          <SelectItem value="DispBeamColumn">Fiber beam-column (disp)</SelectItem>
          <SelectItem value="Truss">Truss</SelectItem>
        </SelectContent>
      </Select>
      {kind === 'ElasticBeamColumn' && elastic.map((f) => field(f.key, f.cat))}
      {kind === 'Truss' && field('A', 'area')}
      {kind !== 'ElasticBeamColumn' && (
        <Select items={refs} value={ref} onValueChange={(v) => setRef(v ?? '')}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue placeholder={refs.length ? (kind === 'Truss' ? 'Material' : 'Beam integration') : kind === 'Truss' ? 'No uniaxial materials yet' : 'No beam integrations yet'} /></SelectTrigger>
          <SelectContent>{refs.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Button size="sm" className="h-6 text-xs" disabled={!template} onClick={() => template && onDone(template)}>Draw with this</Button>
    </div>
  )
}

/** Floating options for the active draw tool: what it draws (a derived property, or a new one) or the support preset. */
export function DrawOptions() {
  const tool = useAppStore((s) => s.activeTool)
  const model = useAppStore((s) => s.model)
  const template = useAppStore((s) => s.drawTemplate)
  const setTemplate = useAppStore((s) => s.setDrawTemplate)
  const preset = useAppStore((s) => s.supportPreset)
  const setPreset = useAppStore((s) => s.setSupportPreset)
  const [creating, setCreating] = useState(false)
  const props = useMemo(() => deriveProperties(model).filter((p) => p.kind === 'frame'), [model])
  const items = useMemo(() => {
    const list = props.map((p) => ({ value: p.key, label: `${p.name} (${p.elementIds.length})` }))
    if (template && !list.some((i) => i.value === templateKey(template))) list.unshift({ value: templateKey(template), label: `${templateName(model, template)} (new)` })
    return list
  }, [props, template, model])

  // Start drawing with the most used property when nothing is chosen yet.
  useEffect(() => { if (tool !== 'select' && tool !== 'support' && !template && props[0]) setTemplate({ eleType: props[0].eleType, args: props[0].args }) }, [tool, template, props, setTemplate])

  if (tool === 'select') return null
  const pick = (key: string | null) => {
    const p = props.find((x) => x.key === key)
    if (p) setTemplate({ eleType: p.eleType, args: p.args })
  }
  return (
    <div className="absolute left-2 top-9 z-30 w-64 rounded-sm border bg-background/95 p-2 text-xs shadow" data-hotkeys-ignore="true">
      <div className="font-medium">{TITLES[tool]}</div>
      <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">{HINTS[tool]}</p>
      {tool === 'support' ? (
        <Select items={[{ value: 'fixed', label: 'Fixed' }, { value: 'pinned', label: 'Pinned' }, { value: 'roller', label: 'Roller (vertical)' }]} value={preset} onValueChange={(v) => v && setPreset(v as typeof preset)}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="pinned">Pinned</SelectItem>
            <SelectItem value="roller">Roller (vertical)</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="grid gap-1.5">
          <Select items={items} value={template ? templateKey(template) : ''} onValueChange={pick}>
            <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue placeholder={items.length ? 'Property' : 'No frame properties yet'} /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
          </Select>
          {template && !isFrameTemplate(template) && <p className="text-destructive">This property is not a frame member.</p>}
          {!template && <p className="text-muted-foreground">Choose a property, or create one, to draw.</p>}
          {creating ? <NewProperty onDone={(t) => { setTemplate(t); setCreating(false) }} /> : <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setCreating(true)}>New property…</Button>}
        </div>
      )}
    </div>
  )
}
