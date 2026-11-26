import { useState } from 'react'
import type { ElementEntity, MaterialEntity } from '@/app/types/model'
import { rebuildStudWall, studWallArgs, studWallFrame, studWallLayoutProblems, unanchoredPierEnds } from '@/app/lib/studWalls'
import { wallPiers } from '@/app/lib/studBuilding'
import { convertLeft, fmt, layoutText, newOpeningText, parseLayout, type OpeningText } from '@/app/lib/studWallForm'
import { CUSTOM, framingStiffness, GRADE_ITEMS, guessFraming, HEADER_ITEMS, lumberScale, RIMS, STUD_ITEMS, type Member } from '@/app/lib/lumber'
import { useUnits } from '@/app/lib/units/useUnits'
import type { Category } from '@/app/lib/units/units'
import { useAppStore } from '@/app/store/useAppStore'
import { diaphragmArgs } from '@/app/lib/diaphragms'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/app/components/ui/select'

const Row = ({ k, v }: { k: string; v: string }) => <><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{v}</span></>

/** A Carapace-only stud wall: summary and layout editor (studs, openings, chords, sheathing, floor zone). Applying rebuilds the wall's stations. */
export function StudWallCard({ element }: { element: ElementEntity }) {
  const u = useUnits()
  const [note, setNote] = useState<{ id: number; text: string } | null>(null)
  const l = studWallArgs(element.args).layout
  if (!l) return null
  // Keyed by the stored layout (and display units), so the form restarts from it after an apply or an undo.
  return <StudWallEditor key={`${element.id}|${u.symbol('length')}|${u.symbol('force')}|${JSON.stringify(l)}|${JSON.stringify(studWallArgs(element.args).framing ?? null)}`} element={element} note={note?.id === element.id ? note.text : ''} onNote={(text) => setNote({ id: element.id, text })} />
}

function StudWallEditor({ element, note, onNote }: { element: ElementEntity; note: string; onNote: (text: string) => void }) {
  const u = useUnits()
  const model = useAppStore((s) => s.model)
  const editModel = useAppStore((s) => s.editModel)
  const a = studWallArgs(element.args)
  const l = a.layout
  const units = model.config?.units
  const [scale] = useState(() => lumberScale(units, l.height))
  const [f0] = useState(() => a.framing ?? guessFraming(l, scale, !units || !['in', 'ft'].includes(units.length)))
  const [initial] = useState(() => ({ abs: layoutText(l, f0, u), rel: layoutText(l, f0, u, true) }))
  const [relative, setRelative] = useState(false)
  const [text, setText] = useState(initial.abs.text)
  const [openings, setOpenings] = useState(initial.abs.openings)
  const frame = studWallFrame(model, element)
  const init = relative ? initial.rel : initial.abs
  const parsed = parseLayout(l, f0, init, text, openings, u, scale, relative)
  const computed = parsed.framing && framingStiffness(parsed.framing, scale, l.floor?.depth)

  const len = (v: number) => `${fmt(u.toDisplay('length', v))}${u.symbol('length') ? ` ${u.symbol('length')}` : ''}`
  const problems = parsed.layout ? studWallLayoutProblems(parsed.layout, frame?.L ?? l.length) : parsed.errors
  const dirty = JSON.stringify(text) !== JSON.stringify(init.text) || JSON.stringify(openings) !== JSON.stringify(init.openings)
  const free = unanchoredPierEnds(model, element)
  const ph = (cat: Category) => (u.active ? u.symbol(cat) : '')
  const shown = (cat: Category, v: number | undefined) => (v !== undefined && Number.isFinite(v) ? `${fmt(u.toDisplay(cat, v))}${ph(cat) ? ` ${ph(cat)}` : ''}` : '')
  const set = (patch: Record<string, string>) => setText({ ...text, ...patch })
  const field = (key: string, label: string, cat: Category, placeholder?: string) => (
    <label key={key} className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>
      <Input className="h-6 text-xs" value={text[key] ?? ''} placeholder={placeholder ?? ph(cat)} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  )
  const plies = (key: string, label: string) => (
    <label key={key} className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>
      <Input className="h-6 text-xs" type="number" min={1} step={1} value={text[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  )
  const pick = (value: string, onChange: (v: string) => void, options: { value: string; label: string; group?: string }[]) => (
    <Select items={options} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size="sm" className="h-6 w-full text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {[...new Set(options.map((o) => o.group ?? ''))].map((g) => (
          <SelectGroup key={g}>{g && <SelectLabel>{g}</SelectLabel>}{options.filter((o) => (o.group ?? '') === g).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
  const grade = (key: string, eKey: string, label: string) => (
    <div className="grid gap-1">
      <label className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>{pick(text[key], (v) => set({ [key]: v }), GRADE_ITEMS)}</label>
      {text[key] === CUSTOM && field(eKey, 'E', 'stress')}
    </div>
  )
  const over = (m: Member, label: string, cat: Category, value: number | undefined) => field(m, label, cat, shown(cat, value) || ph(cat))
  const opening = (i: number, patch: Partial<OpeningText>) => setOpenings(openings.map((o, k) => (k === i ? { ...o, ...patch } : o)))
  const toggleRelative = (r: boolean) => { setOpenings(openings.map((o) => ({ ...o, left: convertLeft(o.left, r, l.length, u) }))); setRelative(r) }
  const fill = () => {
    const sp = u.parse('length', text.spacing)
    if (!sp || sp <= 0) return
    const xs = [0]
    for (let x = sp; x < l.length - 1e-9 * l.length; x += sp) xs.push(Number(x.toPrecision(12)))
    xs.push(l.length)
    set({ positions: xs.map((x) => fmt(u.toDisplay('length', x))).join(', ') })
  }
  const addOpening = () => {
    const w = l.length / 4, x0 = (l.length - w) / 2
    const left = relative ? fmt(x0 / l.length) : fmt(u.toDisplay('length', x0))
    setOpenings([...openings, newOpeningText(openings.at(-1), left, fmt(u.toDisplay('length', w)), fmt(u.toDisplay('length', 0.85 * l.height)), fmt(u.toDisplay('length', 0.5 * l.height)))])
  }
  const apply = () => {
    if (!parsed.layout || problems.length) return
    let kept: number[] = [], added: number[] = []
    editModel((m) => { const r = rebuildStudWall(m, element.id, parsed.layout!, parsed.framing); kept = r.kept; added = r.added; return r.model })
    onNote([added.length ? `${added.length} station node${added.length > 1 ? 's' : ''} added.` : '', kept.length ? `Node${kept.length > 1 ? 's' : ''} ${kept.join(', ')} left the wall but ${kept.length > 1 ? 'are' : 'is'} still used elsewhere.` : ''].filter(Boolean).join(' ') || 'Layout applied.')
  }
  const reset = () => { setText(init.text); setOpenings(init.openings) }

  return (
    <div className="grid gap-2 text-[11px]">
      <div className="font-medium">Stud wall {element.id}{a.label ? ` — ${a.label}` : ''}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <Row k="Length × height" v={`${len(l.length)} × ${len(l.height)}`} />
        {l.floor && <Row k="Floor zone" v={`${len(l.floor.depth)} deep`} />}
        <Row k="Piers" v={wallPiers(l).map((p) => len(p.width)).join(', ') || 'none'} />
        <Row k="Nodes" v={`4 corners, ${a.stations.filter((s) => s.chord === 'top').length} top / ${a.stations.filter((s) => s.chord === 'bottom').length} bottom stations`} />
      </div>
      {free.length > 0 && <p className="text-[10px] text-amber-700">No hold-down at pier end{free.length > 1 ? 's' : ''} x = {free.map(len).join(', ')}. Add an anchorage zeroLength from the bottom node to the ground or the wall below.</p>}

      <div className="font-medium pt-1">Lumber</div>
      {grade('grade', 'e', 'Species and grade')}
      {scale.assumed && <p className="text-[10px] text-muted-foreground">Unitless model: lumber sizes and E are taken as {scale.assumed.force} and {scale.assumed.length}.</p>}

      <div className="font-medium pt-1">Studs</div>
      <label className="grid gap-0.5"><span className="text-muted-foreground">Positions (x from the start corner, comma-separated)</span>
        <textarea className="min-h-12 rounded-none border bg-transparent px-2 py-1 text-xs" value={text.positions} onChange={(e) => set({ positions: e.target.value })} />
      </label>
      <div className="flex items-end gap-1">
        {field('spacing', 'Regular spacing', 'length')}
        <Button size="sm" variant="outline" className="h-6 text-xs" disabled={!(u.parse('length', text.spacing ?? '') ?? 0)} onClick={fill}>Fill</Button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <label className="grid gap-0.5"><span className="text-muted-foreground">Stud size</span>{pick(text.stud, (v) => set({ stud: v }), STUD_ITEMS)}</label>
        {plies('endPlies', 'End post plies')}
        {plies('topPlies', 'Top plates')}{plies('bottomPlies', 'Bottom plates')}
      </div>
      <label className="grid gap-0.5"><span className="text-muted-foreground">Top chord distribution</span>
        {pick(text.topDistribution, (v) => set({ topDistribution: v }), [{ value: 'beam', label: 'Beam' }, { value: 'direct', label: 'Direct' }])}
      </label>

      <div className="flex items-center justify-between pt-1">
        <span className="font-medium">Openings</span>
        <label className="ml-auto mr-2 flex items-center gap-1"><Checkbox checked={relative} onCheckedChange={(c) => toggleRelative(c === true)} />Relative left (0–1)</label>
        <Button size="sm" variant="outline" className="h-6 text-xs" onClick={addOpening}>Add</Button>
      </div>
      {openings.length > 0 && grade('headerGrade', 'headerE', 'Header grade')}
      {openings.map((o, i) => (
        <div key={i} className="grid gap-1 border p-1.5">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1"><Checkbox checked={o.door} onCheckedChange={(c) => opening(i, { door: c === true })} />Door</label>
            <Button size="sm" variant="ghost" className="ml-auto h-5 px-1 text-[10px]" onClick={() => setOpenings(openings.filter((_, k) => k !== i))}>Remove</Button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {([['left', relative ? 'Left (fraction of length)' : 'Left edge', relative ? '0–1' : ph('length')], ['width', 'Width', ph('length')], ['head', 'Head height', ph('length')], ...(o.door ? [] : [['open', 'Opening height', ph('length')]])] as [keyof OpeningText, string, string][]).map(([k, label, placeholder]) => (
              <label key={k} className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>
                <Input className="h-6 text-xs" value={o[k] as string} placeholder={placeholder} onChange={(e) => opening(i, { [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-1">
            <label className="grid gap-0.5"><span className="text-muted-foreground">Header</span>{pick(o.header, (v) => opening(i, { header: v }), HEADER_ITEMS)}</label>
            {([['headerPlies', 'Plies'], ['jackPlies', 'Jacks']] as const).map(([k, label]) => (
              <label key={k} className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>
                <Input className="h-6 text-xs" type="number" min={1} step={1} value={o[k]} onChange={(e) => opening(i, { [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {([['headerEi', 'Header EI', 'rigidity', computed?.openings[i]?.headerEi], ['jackEa', 'Jack EA', 'force', computed?.openings[i]?.jackEa]] as const).map(([k, label, cat, v]) => (
              <label key={k} className="grid gap-0.5"><span className="text-muted-foreground">{label}</span>
                <Input className="h-6 text-xs" value={o[k]} placeholder={shown(cat, v) || ph(cat)} onChange={(e) => opening(i, { [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="font-medium pt-1">Sheathing</div>
      {pick(text.law, (v) => set({ law: v }), [{ value: 'linear', label: 'Linear (Ga)' }, { value: 'o86', label: 'CSA O86 nail slip' }])}
      <div className="grid grid-cols-3 gap-1">
        {text.law === 'o86' ? [field('bv', 'Bv', 'forcePerLength'), field('nailSpacing', 'Nail spacing', 'length'), field('nailDiameter', 'Nail dia.', 'length')] : field('ga', 'Ga', 'forcePerLength')}
      </div>

      {l.floor && <>
        <div className="font-medium pt-1">Floor zone</div>
        <div className="grid grid-cols-[2fr_1fr] gap-1">
          <label className="grid gap-0.5"><span className="text-muted-foreground">Rim</span>{pick(text.rimSize, (v) => set({ rimSize: v }), RIMS.map((r) => ({ value: r.key, label: r.label })))}</label>
          {plies('rimPlies', 'Plies')}
        </div>
        {grade('rimGrade', 'rimE', 'Rim grade')}
        {field('floorGa', 'Floor zone Ga', 'forcePerLength')}
      </>}

      <div className="font-medium pt-1">Stiffness</div>
      <p className="text-[10px] text-muted-foreground">From the lumber; type a value to override it, clear it to go back.</p>
      <div className="grid grid-cols-2 gap-1">
        {over('studEa', 'Stud EA', 'force', computed?.studEa)}{over('endEa', 'End post EA', 'force', computed?.endEa)}
        {over('topEa', 'Top EA', 'force', computed?.topEa)}{over('topEi', 'Top EI ("none" for none)', 'rigidity', computed?.topEi)}
        {over('bottomEa', 'Bottom EA', 'force', computed?.bottomEa)}{over('bottomEi', 'Bottom EI', 'rigidity', computed?.bottomEi)}
        {l.floor && over('rimEa', 'Rim EA', 'force', computed?.rimEa)}
      </div>

      {dirty && problems.length > 0 && <ul className="list-disc pl-4 text-[10px] text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex gap-1">
        <Button size="sm" className="h-6 flex-1 text-xs" disabled={!dirty || problems.length > 0} onClick={apply}>Apply layout</Button>
        <Button size="sm" variant="outline" className="h-6 text-xs" disabled={!dirty} onClick={reset}>Reset</Button>
      </div>
      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
      <p className="text-[10px] text-muted-foreground">Carapace-only. Applying rebuilds the wall's chord stations (studs and pier ends); nodes something else uses are kept. OpenSees export writes this wall as elastic shells with a warning.</p>
    </div>
  )
}


/** Read-only summary of the Carapace-only anchorage (hold-down) material. */
export function AnchorageCard({ material }: { material: MaterialEntity }) {
  const a = material.args
  return (
    <div className="grid gap-1.5 text-[11px]">
      <div className="font-medium">Anchorage {material.id}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <Row k="Tension stiffness" v={String(a.tension)} />
        <Row k="Slack" v={String(a.slack)} />
        <Row k="Bearing" v={a.bearing === 'linear' ? `linear, k ${String(a.k)}` : `O86 crush, qr ${String(a.qr)}`} />
      </div>
      <p className="text-[10px] text-muted-foreground">Carapace-only hold-down. OpenSees export writes an Elastic material with the tension and initial bearing stiffness, without slack or crushing.</p>
    </div>
  )
}

/** Summary of a Carapace-only flexible diaphragm (reassign it from the selection pane to change it). */
export function DiaphragmCard({ element }: { element: ElementEntity }) {
  const u = useUnits()
  const { label, layout } = diaphragmArgs(element.args)
  if (!layout) return null
  const len = (v: number) => `${fmt(u.toDisplay('length', v))}${u.symbol('length') ? ` ${u.symbol('length')}` : ''}`
  const laws = [...new Set(layout.bays.map((b) => (!b ? 'opening' : b.kind === 'linear' ? `linear, Ga ${fmt(u.toDisplay('forcePerLength', b.ga))}` : `CSA O86, Bv ${fmt(u.toDisplay('forcePerLength', b.bv))}`)))]
  const eas = [...new Set([...layout.eaU, ...layout.eaV].map((v) => fmt(u.toDisplay('force', v))))]
  return (
    <div className="grid gap-1.5 text-[11px]">
      <div className="font-medium">Flexible diaphragm {element.id}{label ? ` — ${label}` : ''}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <Row k="Extent" v={`${len(layout.u.at(-1)! - layout.u[0])} × ${len(layout.v.at(-1)! - layout.v[0])}`} />
        <Row k="Grid" v={`${layout.u.length} × ${layout.v.length} nodes, ${layout.bays.length} bays`} />
        <Row k="Bays" v={laws.join('; ')} />
        <Row k="Line EA" v={`${eas.join(', ')}${u.symbol('force') ? ` ${u.symbol('force')}` : ''}`} />
      </div>
      <p className="text-[10px] text-muted-foreground">Carapace-only; carries the two plan translations of its grid nodes. OpenSees export writes one elastic shell per bay with a warning. To change it, select its nodes and assign again.</p>
    </div>
  )
}
