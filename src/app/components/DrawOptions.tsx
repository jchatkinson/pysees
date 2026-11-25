import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore, type ToolId } from '@/app/store/useAppStore'
import { deriveProperties, sectionName, templateKey, templateName, type DrawTemplate } from '@/app/lib/editor/properties'
import { isFrameTemplate } from '@/app/lib/editor/draw'
import { useUnits } from '@/app/lib/units/useUnits'
import type { BaseUnits, Category } from '@/app/lib/units/units'
import { isStudWall, studWallArgs, studWallTemplateOf, type StudWallTemplate } from '@/app/lib/studWalls'
import { CUSTOM, framingStiffness, GRADE_ITEMS, HEADER_ITEMS, lumberScale, sizeOf, STUD_ITEMS, type WallFraming } from '@/app/lib/lumber'
import { isJoistFloor, joistFloorArgs, type JoistFloorArgs } from '@/app/lib/floors'
import { UnderlayPickPanel } from './UnderlayPickPanel'

const HINTS: Record<Exclude<ToolId, 'select'>, string> = {
  frame: 'Click points to draw members. Right-click or Enter ends the chain; Esc leaves the tool. Shift locks to an axis.',
  quickBeam: 'Click a grid bay to place a beam on it.',
  quickColumn: 'Plan: click a grid intersection (column from the story below). Elevation: click a bay between levels.',
  shell: 'Plan: click a grid cell for a floor. Elevation: click a panel between grids and levels for a wall. Each side is split into the divisions below.',
  studWall: 'Plan: click points to draw stud walls along them, each spanning the story below this level. Right-click or Enter ends the chain. Pier ends are held down to a wall below or, on the lowest story, to the ground. Add new walls to the diaphragm afterwards (select the top nodes).',
  floor: 'Plan: click the floor outline point by point (any shape) at this level; click the first point, right-click or Enter to close it. Joists run in the set direction at the set spacing and carry gravity to the stud walls under them; give the floor its loads in its properties.',
  support: 'Click a node to give it this support.',
  underlay: 'Pick points on the PDF underlay.',
}
const TITLES: Record<Exclude<ToolId, 'select'>, string> = { frame: 'Draw frame', quickBeam: 'Quick beams', quickColumn: 'Quick columns', shell: 'Shells', studWall: 'Stud walls', floor: 'Joist floors', support: 'Supports', underlay: 'Underlay' }

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
/** The shell tool's property (derived shell properties, or a new elastic plate section) and mesh divisions. */
function ShellOptions() {
  const model = useAppStore((s) => s.model)
  const template = useAppStore((s) => s.shellTemplate)
  const setTemplate = useAppStore((s) => s.setShellTemplate)
  const divisions = useAppStore((s) => s.shellDivisions)
  const setDivisions = useAppStore((s) => s.setShellDivisions)
  const writeModelEntity = useAppStore((s) => s.writeModelEntity)
  const units = useUnits()
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState<Record<string, string>>({ nu: '0.2' })
  const props = useMemo(() => deriveProperties(model).filter((p) => p.kind === 'shell'), [model])
  const plateSections = [...model.sections.values()].filter((s) => s.secType === 'ElasticMembranePlateSection')
  const items = useMemo(() => {
    const list = props.map((p) => ({ value: p.key, label: `${p.name} (${p.elementIds.length})` }))
    for (const s of plateSections) {
      const t = { eleType: 'ShellMITC4', args: { secTag: s.id } }
      if (!list.some((i) => i.value === templateKey(t))) list.push({ value: templateKey(t), label: `${templateName(model, t)} (unused)` })
    }
    return list
  }, [props, plateSections, model])
  useEffect(() => { if (!template && items[0]) { const p = props[0]; setTemplate(p ? { eleType: p.eleType, args: p.args } : { eleType: 'ShellMITC4', args: { secTag: plateSections[0].id } }) } }, [template, items, props, plateSections, setTemplate])
  const pick = (key: string | null) => {
    const p = props.find((x) => x.key === key)
    if (p) return setTemplate({ eleType: p.eleType, args: p.args })
    const s = plateSections.find((x) => templateKey({ eleType: 'ShellMITC4', args: { secTag: x.id } }) === key)
    if (s) setTemplate({ eleType: 'ShellMITC4', args: { secTag: s.id } })
  }
  const create = () => {
    const eMod = units.parse('stress', text.E ?? ''), h = units.parse('length', text.h ?? ''), nu = Number(text.nu)
    if (!(eMod && eMod > 0 && h && h > 0 && nu >= 0 && nu < 0.5)) return
    const id = model.nextIds.section
    writeModelEntity({ kind: 'section', entity: { id, secType: 'ElasticMembranePlateSection', args: { type: 'ElasticMembranePlateSection', secTag: id, eMod, nu, h, rho: 0 }, children: [] } })
    setTemplate({ eleType: 'ShellMITC4', args: { secTag: id } })
    setCreating(false)
  }
  const field = (key: string, label: string, cat?: Category) => (
    <label key={key} className="grid grid-cols-[2.5rem_1fr] items-center gap-1">
      <span>{label}</span>
      <Input className="h-6 text-xs" value={text[key] ?? ''} placeholder={cat && units.active ? units.symbol(cat) : ''} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
    </label>
  )
  return (
    <div className="grid gap-1.5">
      <Select items={items} value={template ? templateKey(template) : ''} onValueChange={pick}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue placeholder={items.length ? 'Shell property' : 'No shell sections yet'} /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
      <label className="grid grid-cols-[4.5rem_1fr] items-center gap-1">
        <span>Divisions</span>
        <Input type="number" min={1} max={50} className="h-6 text-xs" value={divisions} onChange={(e) => setDivisions(Number(e.target.value))} />
      </label>
      {creating ? (
        <div className="grid gap-1.5 border-t pt-1.5">
          {field('E', 'E', 'stress')}{field('nu', 'ν')}{field('h', 'h', 'length')}
          <Button size="sm" className="h-6 text-xs" onClick={create}>Create plate section</Button>
        </div>
      ) : <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setCreating(true)}>New shell section…</Button>}
    </div>
  )
}

/** The floor tool's framing: like an existing floor, or set here (direction, spacing, joist, spans). */
function FloorOptions() {
  const model = useAppStore((s) => s.model)
  const template = useAppStore((s) => s.floorTemplate)
  const setTemplate = useAppStore((s) => s.setFloorTemplate)
  const units = useUnits()
  const floors = useMemo(() => [...model.elements.values()].filter((e) => isJoistFloor(e.eleType)).sort((a, b) => a.id - b.id), [model])
  const fallback = useMemo((): JoistFloorArgs => {
    const mm = lumberScale(model.config?.units, 2400).mm, imperial = ['in', 'ft'].includes(model.config?.units?.length ?? '')
    return { angle: 0, spacing: Number((406 * mm).toPrecision(6)), joist: { grade: imperial ? 'nds-spf' : 'o86-spf', size: '2x10', plies: 1 }, continuity: 'simple', subfloor: Number((19 * mm).toPrecision(6)) }
  }, [model.config?.units])
  useEffect(() => { if (!template) { const f = floors[0]; const { label: _label, ...rest } = f ? joistFloorArgs(f.args) : fallback; void _label; setTemplate(rest) } }, [template, floors, fallback, setTemplate])
  const [spacing, setSpacing] = useState<string | null>(null)
  if (!template) return null
  const set = (patch: Partial<JoistFloorArgs>) => setTemplate({ ...template, ...patch })
  const pick = (value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <Select items={options} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size="sm" className="h-6 w-full text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  )
  const label = (text: string, child: React.ReactNode) => <label className="grid gap-0.5"><span className="text-[11px] text-muted-foreground">{text}</span>{child}</label>
  return (
    <div className="grid gap-1.5">
      {floors.length > 0 && pick('', (v) => { const f = floors.find((x) => String(x.id) === v); if (f) { const { label: _l, ...rest } = joistFloorArgs(f.args); void _l; setTemplate(rest) } }, floors.map((f) => ({ value: String(f.id), label: `Like floor ${f.id}${joistFloorArgs(f.args).label ? ` (${joistFloorArgs(f.args).label})` : ''}` })))}
      <div className="grid grid-cols-2 gap-1">
        {label('Joist direction (° from X)', <Input className="h-6 text-xs" type="number" step={15} value={template.angle} onChange={(e) => Number.isFinite(Number(e.target.value)) && set({ angle: Number(e.target.value) })} />)}
        {label('Spacing', <Input className="h-6 text-xs" value={spacing ?? String(Number(units.toDisplay('length', template.spacing).toPrecision(6)))} placeholder={units.active ? units.symbol('length') : ''}
          onChange={(e) => { setSpacing(e.target.value); const v = units.parse('length', e.target.value); if (v && v > 0) set({ spacing: v }) }} onBlur={() => setSpacing(null)} />)}
        {label('Joist', pick(template.joist.size, (v) => set({ joist: { ...template.joist, size: v } }), HEADER_ITEMS))}
        {label('Spans', pick(template.continuity, (v) => set({ continuity: v === 'continuous' ? 'continuous' : 'simple' }), [{ value: 'simple', label: 'Simple' }, { value: 'continuous', label: 'Continuous' }]))}
      </div>
      {label('Grade', pick(template.joist.grade, (v) => set({ joist: { ...template.joist, grade: v } }), GRADE_ITEMS))}
    </div>
  )
}

type WallField = 'spacing' | 'ga' | 'depth' | 'floorGa' | 'tension' | 'bearing'
const WALL_FIELDS: [WallField, string, Category, boolean?][] = [
  ['spacing', 'Stud spacing', 'length'], ['ga', 'Sheathing Ga', 'forcePerLength'], ['depth', 'Floor depth', 'length', true], ['floorGa', 'Floor Ga', 'forcePerLength', true],
  ['tension', 'Hold-down k', 'forcePerLength'], ['bearing', 'Bearing k', 'forcePerLength'],
]
interface WallLumber { grade: string; e?: number; stud: string; endPlies: number; topPlies: number; bottomPlies: number }

/**
 * A starting wall in model units: 2x6 studs at 16 in (406 mm), 3-ply end posts, double top plate, Ga 2 kN/mm (about 7/16 in OSB), a 254 mm
 * floor zone with the stud-building template's band Ga, and its hold-down (15 kN/mm, bearing 1000 kN/mm).
 */
function defaultWall(units: BaseUnits | undefined): { values: Record<WallField, number>; lumber: WallLumber } {
  const s = lumberScale(units, 2400), fpl = s.mm * s.mpa // N/mm in model force per length
  const imperial = ['in', 'ft'].includes(units?.length ?? '')
  return {
    values: { spacing: (imperial ? 16 * 25.4 : 406) * s.mm, ga: 2000 * fpl, depth: 254 * s.mm, floorGa: 10000 * fpl, tension: 15000 * fpl, bearing: 1e6 * fpl },
    lumber: { grade: imperial ? 'nds-spf' : 'o86-spf', stud: '2x6', endPlies: 3, topPlies: 2, bottomPlies: 1 },
  }
}

/** The tool's wall template from field values; null when a member stiffness comes out non-positive. */
function wallTemplateFrom(v: Record<WallField, number>, l: WallLumber, units: BaseUnits | undefined): StudWallTemplate | null {
  const depth = v.depth > 0 ? v.depth : 0
  const custom = l.grade === CUSTOM ? { e: l.e ?? NaN } : {}
  const framing: WallFraming = {
    grade: l.grade, ...custom, stud: l.stud, endPlies: l.endPlies, topPlies: l.topPlies, bottomPlies: l.bottomPlies,
    headerGrade: l.grade, ...(l.grade === CUSTOM ? { headerE: l.e ?? NaN } : {}), openings: [], ...(depth ? { rim: { size: 'rim32', plies: 1, grade: l.grade, ...custom } } : {}),
  }
  // A unitless model is taken as N–mm here; drawing re-derives from the storey height.
  const k = framingStiffness(framing, lumberScale(units, 2400), depth || undefined)
  if (![k.studEa, k.endEa, k.topEa, k.bottomEa].every((x) => x > 0)) return null
  return {
    spacing: v.spacing, studEa: k.studEa, endEa: k.endEa, topEa: k.topEa, topEi: k.topEi, topDistribution: 'beam', bottomEa: k.bottomEa, bottomEi: k.bottomEi,
    law: { kind: 'linear', ga: v.ga }, ...(depth ? { floor: { depth, ga: v.floorGa, rimEa: k.rimEa ?? 0 } } : {}), holdDown: { tension: v.tension, k: v.bearing }, framing,
  }
}

/** The stud-wall tool's wall type: like an existing wall, the default wall, or one edited here (every field starts at the default). */
function WallOptions() {
  const model = useAppStore((s) => s.model)
  const template = useAppStore((s) => s.wallTemplate)
  const setTemplate = useAppStore((s) => s.setWallTemplate)
  const units = useUnits()
  const base = model.config?.units
  const defaults = useMemo(() => defaultWall(base), [base])
  const defaultTemplate = useMemo(() => wallTemplateFrom(defaults.values, defaults.lumber, base), [defaults, base])
  const [editing, setEditing] = useState(false)
  const show = (cat: Category, v: number) => String(Number(units.toDisplay(cat, v).toPrecision(4)))
  const [text, setText] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(WALL_FIELDS.map(([k, , cat]) => [k, show(cat, defaults.values[k])])),
    grade: defaults.lumber.grade, stud: defaults.lumber.stud, endPlies: String(defaults.lumber.endPlies), topPlies: String(defaults.lumber.topPlies), bottomPlies: String(defaults.lumber.bottomPlies), e: '',
  }))
  const types = useMemo(() => {
    const seen = new Map<string, { label: string; t: StudWallTemplate }>()
    if (defaultTemplate) seen.set(JSON.stringify(defaultTemplate), { label: 'Default wall', t: defaultTemplate })
    for (const e of [...model.elements.values()].sort((a, b) => a.id - b.id)) {
      if (!isStudWall(e.eleType)) continue
      const t = studWallTemplateOf(model, e)
      if (t && !seen.has(JSON.stringify(t))) seen.set(JSON.stringify(t), { label: `Like wall ${e.id}${studWallArgs(e.args).label ? ` (${studWallArgs(e.args).label})` : ''}`, t })
    }
    return [...seen].map(([value, { label, t }]) => ({ value, label, t }))
  }, [model, defaultTemplate])
  // Draw right away: like the last wall drawn in the model, else the default wall.
  useEffect(() => { if (!template && types.length) setTemplate(types[types.length - 1].t) }, [template, types, setTemplate])
  const key = template ? JSON.stringify(template) : ''
  const items = types.some((i) => i.value === key) || !template ? types : [{ value: key, label: 'Edited wall type', t: template }, ...types]
  const len = (v: number) => `${Number(units.toDisplay('length', v).toPrecision(4))}${units.symbol('length') ? ` ${units.symbol('length')}` : ''}`

  const count = (v: string) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : NaN }
  const values = Object.fromEntries(WALL_FIELDS.map(([k, , cat]) => [k, units.parse(cat, text[k] ?? '') ?? (k === 'depth' && !text[k]?.trim() ? 0 : NaN)])) as Record<WallField, number>
  const lumber: WallLumber = { grade: text.grade, e: units.parse('stress', text.e) ?? undefined, stud: text.stud, endPlies: count(text.endPlies), topPlies: count(text.topPlies), bottomPlies: count(text.bottomPlies) }
  // Required fields positive; the floor zone (depth blank or 0 = none) needs its Ga.
  const fieldsOk = WALL_FIELDS.every(([k, , , optional]) => (optional ? !(values[k] < 0) : values[k] > 0)) && (!(values.depth > 0) || values.floorGa > 0)
  const edited = fieldsOk ? wallTemplateFrom(values, lumber, base) : null
  const select = (k: 'grade' | 'stud', label: string, options: { value: string; label: string }[]) => (
    <label key={k} className="col-span-2 grid gap-0.5"><span className="text-[11px] text-muted-foreground">{label}</span>
      <Select items={options} value={text[k]} onValueChange={(val) => val && setText({ ...text, [k]: val })}>
        <SelectTrigger size="sm" className="h-6 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
  const holdDown = template?.anchorage !== undefined ? `hold-downs with material ${template.anchorage}` : template?.holdDown ? `hold-downs ${show('forcePerLength', template.holdDown.tension)}${units.active ? ` ${units.symbol('forcePerLength')}` : ''}` : 'no hold-downs'
  return (
    <div className="grid gap-1.5">
      <Select items={items.map(({ value, label }) => ({ value, label }))} value={key} onValueChange={(val) => { const i = items.find((x) => x.value === val); if (i) setTemplate(i.t) }}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue placeholder="Wall type" /></SelectTrigger>
        <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
      </Select>
      {template && <p className="text-[11px] text-muted-foreground">{template.framing ? `${sizeOf(template.framing.stud)?.label.split(' ·')[0] ?? ''} studs` : 'Studs'} at {len(template.spacing)}{template.floor ? `, floor zone ${len(template.floor.depth)}` : ''}, sheathing {template.law.kind === 'o86' ? 'CSA O86' : 'linear'}, {holdDown}. Openings: edit the wall afterwards.</p>}
      {editing ? (
        <div className="grid grid-cols-2 gap-1 border-t pt-1.5">
          {select('grade', 'Species and grade', GRADE_ITEMS)}
          {text.grade === CUSTOM && <label className="col-span-2 grid gap-0.5"><span className="text-[11px] text-muted-foreground">E</span><Input className="h-6 text-xs" value={text.e} placeholder={units.active ? units.symbol('stress') : ''} onChange={(e) => setText({ ...text, e: e.target.value })} /></label>}
          {select('stud', 'Stud size', STUD_ITEMS)}
          {([['endPlies', 'End post plies'], ['topPlies', 'Top plates'], ['bottomPlies', 'Bottom plates']] as const).map(([k, label]) => (
            <label key={k} className="grid gap-0.5"><span className="text-[11px] text-muted-foreground">{label}</span>
              <Input className="h-6 text-xs" type="number" min={1} step={1} value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
            </label>
          ))}
          {WALL_FIELDS.map(([k, label, cat]) => (
            <label key={k} className="grid gap-0.5"><span className="text-[11px] text-muted-foreground">{label}{units.active ? ` (${units.symbol(cat)})` : ''}</span>
              <Input className="h-6 text-xs" value={text[k]} aria-invalid={k === 'depth' ? values[k] < 0 || Number.isNaN(values[k]) : !(values[k] > 0)} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
            </label>
          ))}
          <Button size="sm" className="col-span-2 h-6 text-xs" disabled={!edited} onClick={() => { if (edited) { setTemplate(edited); setEditing(false) } }}>Draw with this</Button>
        </div>
      ) : <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditing(true)}>Edit wall type…</Button>}
    </div>
  )
}

/** The right panel's body while a draw tool is active (in place of the command form). */
const DRAW_PANEL = 'h-full overflow-y-auto p-3 text-xs'

export function DrawOptions() {
  const tool = useAppStore((s) => s.activeTool)
  const model = useAppStore((s) => s.model)
  const template = useAppStore((s) => s.drawTemplate)
  const setTemplate = useAppStore((s) => s.setDrawTemplate)
  const preset = useAppStore((s) => s.supportPreset)
  const setPreset = useAppStore((s) => s.setSupportPreset)
  const [creating, setCreating] = useState(false)
  const toolInput = useAppStore((s) => s.toolInput)
  const allStories = useAppStore((s) => s.drawAllStories && s.viewMode.kind === 'plan')
  const props = useMemo(() => deriveProperties(model).filter((p) => p.kind === 'frame'), [model])
  const items = useMemo(() => {
    const list = props.map((p) => ({ value: p.key, label: `${p.name} (${p.elementIds.length})` }))
    if (template && !list.some((i) => i.value === templateKey(template))) list.unshift({ value: templateKey(template), label: `${templateName(model, template)} (new)` })
    return list
  }, [props, template, model])

  // Start drawing with the most used property when nothing is chosen yet.
  useEffect(() => { if (tool !== 'select' && tool !== 'support' && tool !== 'shell' && tool !== 'studWall' && tool !== 'floor' && tool !== 'underlay' && !template && props[0]) setTemplate({ eleType: props[0].eleType, args: props[0].args }) }, [tool, template, props, setTemplate])

  if (tool === 'select') return null
  if (tool === 'underlay') return <UnderlayPickPanel />
  const pick = (key: string | null) => {
    const p = props.find((x) => x.key === key)
    if (p) setTemplate({ eleType: p.eleType, args: p.args })
  }
  return (
    <div className={DRAW_PANEL} data-hotkeys-ignore="true">
      <div className="font-medium">{TITLES[tool]}</div>
      <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">{HINTS[tool]}</p>
      {tool === 'frame' && <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">After the first point, type a length and press Enter to place the next point towards the cursor.</p>}
      {toolInput && <div className="mb-1.5 rounded-sm bg-muted px-1.5 py-0.5 font-mono">Length: {toolInput}<span className="animate-pulse">▌</span></div>}
      {allStories && tool !== 'support' && <div className="mb-1.5 text-[11px] font-medium text-primary">Drawing on all stories</div>}
      {tool === 'shell' ? <ShellOptions /> : tool === 'studWall' ? <WallOptions /> : tool === 'floor' ? <FloorOptions /> : tool === 'support' ? (
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
