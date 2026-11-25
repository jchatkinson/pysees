import { useState } from 'react'
import type { ElementEntity, Model } from '@/app/types/model'
import { floorDepth, floorFrame, floorTakedown, floorTransferRows, isFloorAreaLoad, joistFloorArgs, type FloorAreaLoadArgs, type JoistFloorArgs } from '@/app/lib/floors'
import { CUSTOM, GRADE_ITEMS, HEADER_ITEMS } from '@/app/lib/lumber'
import { fmt } from '@/app/lib/studWallForm'
import { useUnits } from '@/app/lib/units/useUnits'
import type { Category, UnitContext } from '@/app/lib/units/units'
import { useAppStore } from '@/app/store/useAppStore'
import { Button } from '@/app/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { studWallArgs } from '@/app/lib/studWalls'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/app/components/ui/select'

const studWallLabel = (model: Model, id: number) => { const e = model.elements.get(id); if (e && e.eleType !== 'studWall') return `Beam ${id}`; const l = e && studWallArgs(e.args).label; return l ? `${id} · ${l}` : `Wall ${id}` }
const Row = ({ k, v }: { k: string; v: string }) => <><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{v}</span></>

/** Each pattern's area load on the floor (the first `floorLoad` on it), or undefined. */
const areaLoad = (model: Model, pattern: number, floor: number) => {
  const c = model.patterns.get(pattern)?.children.find((ch) => isFloorAreaLoad(ch) && ch.args.floor === floor)
  return c ? (c.args as unknown as FloorAreaLoadArgs).loads.reduce((s, l) => s + l.w, 0) : undefined
}

function initialText(model: Model, e: ElementEntity, u: UnitContext) {
  const a = joistFloorArgs(e.args)
  const d = (cat: Category, v: number | undefined) => (v === undefined ? '' : fmt(u.toDisplay(cat, v)))
  return {
    label: a.label ?? '', angle: String(a.angle), spacing: d('length', a.spacing), grade: a.joist.grade, e: d('stress', a.joist.e), size: a.joist.size, plies: String(a.joist.plies),
    continuity: a.continuity, subfloor: d('length', a.subfloor),
    ...Object.fromEntries([...model.patterns.keys()].map((p) => [`w${p}`, d('stress', areaLoad(model, p, e.id))])),
  } as Record<string, string>
}

/** A Carapace-only joist floor: its framing, its area loads per pattern, and how its joist strips bear on the walls. */
export function FloorCard({ element }: { element: ElementEntity }) {
  const u = useUnits()
  const model = useAppStore((s) => s.model)
  // Keyed by the stored floor and its loads, so the form restarts from them after an apply or an undo.
  const loads = [...model.patterns.keys()].map((p) => areaLoad(model, p, element.id))
  return <FloorEditor key={`${element.id}|${u.symbol('length')}|${u.symbol('force')}|${JSON.stringify(element)}|${JSON.stringify(loads)}`} element={element} />
}

function FloorEditor({ element }: { element: ElementEntity }) {
  const u = useUnits()
  const model = useAppStore((s) => s.model)
  const editModel = useAppStore((s) => s.editModel)
  const a = joistFloorArgs(element.args)
  const [init] = useState(() => initialText(model, element, u))
  const [text, setText] = useState(init)
  const set = (patch: Record<string, string>) => setText({ ...text, ...patch })
  const errors: string[] = []
  // Unchanged text keeps the stored value exactly.
  const num = (key: string, cat: Category, label: string, stored: number | undefined, optional = false): number | undefined => {
    if (text[key] === init[key] && (stored !== undefined || optional)) return stored
    if (optional && text[key].trim() === '') return undefined
    const v = u.parse(cat, text[key])
    if (v === null || !Number.isFinite(v)) { errors.push(`${label}: not a number`); return NaN }
    return v
  }
  const angle = text.angle === init.angle ? a.angle : Number(text.angle)
  if (!Number.isFinite(angle)) errors.push('Joist direction: not a number')
  const spacing = num('spacing', 'length', 'Spacing', a.spacing)!
  if (!(spacing > 0)) errors.push('Spacing must be positive.')
  const plies = Number(text.plies)
  if (!Number.isInteger(plies) || plies < 1) errors.push('Plies: a whole number, at least 1')
  const subfloor = num('subfloor', 'length', 'Subfloor', a.subfloor, true)
  const args: JoistFloorArgs = {
    ...(text.label.trim() ? { label: text.label.trim() } : {}), angle, spacing,
    joist: { grade: text.grade, ...(text.grade === CUSTOM ? { e: num('e', 'stress', 'E', a.joist.e) } : {}), size: text.size, plies },
    continuity: text.continuity === 'continuous' ? 'continuous' : 'simple', ...(subfloor !== undefined ? { subfloor } : {}),
  }
  const patterns = [...model.patterns.values()].sort((p, q) => p.id - q.id)
  const w = new Map(patterns.map((p) => [p.id, num(`w${p.id}`, 'stress', `${p.name ?? `Pattern ${p.id}`} load`, areaLoad(model, p.id, element.id), true)]))
  const dirty = JSON.stringify(text) !== JSON.stringify(init)

  // Bearing check on the edited framing: strips, the walls they bear on, and anything that can't span.
  const trial = { ...model, elements: new Map(model.elements).set(element.id, { ...element, args: args as unknown as Record<string, unknown> }) }
  const check = errors.length ? null : floorTransferRows(trial, element.id, [{ kind: 'area', w: 1 }])
  const walls = check ? [...new Set([...check.rows.flatMap((r) => r.supports.map((s) => s.wall)), ...check.wallLines.map((l) => l.wall)])].sort((p, q) => p - q) : []
  const beams = check ? [...new Set(check.nodal.map((n) => n.beam))].sort((p, q) => p - q) : []
  // Takedown: each bearing wall's reaction per pattern (Σ strip reactions × widths; simple spans by statics, continuous by three moments).
  const loaded = new Map(patterns.flatMap((p) => { const v = w.get(p.id); return v !== undefined && Number.isFinite(v) && v !== 0 ? [[p.id, v] as [number, number]] : [] }))
  const takedown = check && loaded.size ? floorTakedown(trial, element.id, loaded) : null
  const f = floorFrame(model, element)
  const area = f ? Math.abs(f.st.reduce((s, p, i) => { const q = f.st[(i + 1) % f.st.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2 : NaN
  const depth = floorDepth(model, args)
  const show = (cat: Category, v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${fmt(u.toDisplay(cat, v))}${u.symbol(cat) ? ` ${u.symbol(cat)}` : ''}`)

  const apply = () => {
    if (errors.length) return
    editModel((m) => {
      const elements = new Map(m.elements).set(element.id, { ...element, args: args as unknown as Record<string, unknown> })
      const next = new Map([...m.patterns].map(([id, p]) => {
        const kept = p.children.filter((c) => !(isFloorAreaLoad(c) && c.args.floor === element.id))
        const v = w.get(id)
        const load: FloorAreaLoadArgs = { floor: element.id, loads: [{ kind: 'area', w: v ?? 0 }] }
        return [id, { ...p, children: v ? [...kept, { kind: 'floorLoad' as const, args: load as unknown as Record<string, unknown> }] : kept }]
      }))
      return { ...m, elements, patterns: next }
    })
  }

  const field = (key: string, label: string, cat: Category | null, placeholder?: string) => (
    <label key={key} className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>
      <Input className="h-6 text-xs" value={text[key] ?? ''} placeholder={placeholder ?? (cat && u.active ? u.symbol(cat) : '')} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  )
  const pick = (key: string, options: { value: string; label: string; group?: string }[]) => (
    <Select items={options} value={text[key]} onValueChange={(v) => v && set({ [key]: v })}>
      <SelectTrigger size="sm" className="h-6 w-full text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {[...new Set(options.map((o) => o.group ?? ''))].map((g) => (
          <SelectGroup key={g}>{g && <SelectLabel>{g}</SelectLabel>}{options.filter((o) => (o.group ?? '') === g).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="grid gap-2 text-[11px]">
      <div className="font-medium">Joist floor {element.id}{a.label ? ` — ${a.label}` : ''}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <Row k="Outline" v={`${element.nodes.length} nodes, area ${show('area', area)}`} />
        <Row k="Depth" v={`${show('length', depth)} (joist + subfloor)`} />
        <Row k="Bears on" v={[walls.length ? `walls ${walls.join(', ')}` : 'no walls', ...(beams.length ? [`beams ${beams.join(', ')}`] : [])].join('; ')} />
        {check && <Row k="Joist strips" v={String(check.rows.length)} />}
      </div>
      {check?.problems.map((p) => <p key={p} className="text-[10px] text-amber-700">{p[0].toUpperCase() + p.slice(1)}.</p>)}

      <div className="font-medium pt-1">Framing</div>
      {field('label', 'Label', null, 'none')}
      <div className="grid grid-cols-2 gap-1">
        {field('angle', 'Joist direction (° from X)', null)}{field('spacing', 'Spacing', 'length')}
        <label className="grid gap-0.5"><span className="text-muted-foreground">Joist</span>{pick('size', HEADER_ITEMS)}</label>
        {field('plies', 'Plies', null)}
      </div>
      <label className="grid gap-0.5"><span className="text-muted-foreground">Grade</span>{pick('grade', GRADE_ITEMS)}</label>
      {text.grade === CUSTOM && field('e', 'E', 'stress')}
      <div className="grid grid-cols-2 gap-1">
        <label className="grid gap-0.5"><span className="text-muted-foreground">Spans</span>{pick('continuity', [{ value: 'simple', label: 'Simple' }, { value: 'continuous', label: 'Continuous' }])}</label>
        {field('subfloor', 'Subfloor', 'length', 'none')}
      </div>

      <div className="font-medium pt-1">Area loads</div>
      {patterns.length ? <div className="grid grid-cols-2 gap-1">{patterns.map((p) => field(`w${p.id}`, p.name ?? `Pattern ${p.id}`, 'stress', 'none'))}</div>
        : <p className="text-[10px] text-muted-foreground">Add a load pattern to load this floor.</p>}
      <p className="text-[10px] text-muted-foreground">Per unit floor area, downward. Each joist strip carries its tributary width to the stud walls and beams it crosses (hand-calculation reactions; the joists add no stiffness). A beam takes each strip's reaction as point loads on its nodes.</p>

      {takedown && takedown.size > 0 && <>
        <div className="font-medium pt-1">Takedown</div>
        <Table>
          <TableHeader><TableRow><TableHead className="h-6 px-1">Support</TableHead>{[...loaded.keys()].map((p) => <TableHead key={p} className="h-6 px-1">{patterns.find((x) => x.id === p)?.name ?? `Pattern ${p}`}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {[...takedown].sort(([p], [q]) => p - q).map(([wall, m]) => (
              <TableRow key={wall}><TableCell className="px-1 py-0.5">{studWallLabel(model, wall)}</TableCell>{[...loaded.keys()].map((p) => <TableCell key={p} className="px-1 py-0.5 tabular-nums">{show('force', m.get(p))}</TableCell>)}</TableRow>
            ))}
            <TableRow><TableCell className="px-1 py-0.5 text-muted-foreground">Total</TableCell>{[...loaded.keys()].map((p) => <TableCell key={p} className="px-1 py-0.5 tabular-nums text-muted-foreground">{show('force', [...takedown.values()].reduce((sum, m) => sum + (m.get(p) ?? 0), 0))}</TableCell>)}</TableRow>
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground">Floor reactions on each wall and beam (downward), unfactored. Total = load × floor area, less any strips that bear on fewer than two supports.</p>
      </>}

      {dirty && errors.length > 0 && <ul className="list-disc pl-4 text-[10px] text-destructive">{errors.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex gap-1">
        <Button size="sm" className="h-6 flex-1 text-xs" disabled={!dirty || errors.length > 0} onClick={apply}>Apply</Button>
        <Button size="sm" variant="outline" className="h-6 text-xs" disabled={!dirty} onClick={() => setText(init)}>Reset</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Carapace-only. OpenSees export writes its loads as the reactions on the walls' top nodes.</p>
    </div>
  )
}
