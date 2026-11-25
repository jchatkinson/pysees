import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore, type EditDialogKind } from '@/app/store/useAppStore'
import { useUnits } from '@/app/lib/units/useUnits'
import type { Category } from '@/app/lib/units/units'
import { copySelection, divideMembers, memberLoadWrite, mirror, moveSelection, nodalLoadWrites, translate } from '@/app/lib/editor/edit'
import type { P3 } from '@/app/lib/editor/draw'

const TITLES: Record<EditDialogKind, [string, string]> = {
  move: ['Move', 'Move the selected nodes and members by an offset. Members attached from outside the selection stretch to follow.'],
  copy: ['Copy / replicate', 'Copy the selection by an offset, as many times as you like. New nodes merge with existing ones; supports and masses come along.'],
  mirror: ['Mirror', 'Copy the selection reflected across a plane.'],
  divide: ['Divide members', 'Split each selected member into equal parts. Element loads move to the parts.'],
  nodalLoad: ['Nodal load', 'Add a load to each selected node in a load pattern (global directions).'],
  memberLoad: ['Member load', 'Add a uniform load on the selected members in a load pattern (local axes: wy, wz across, wx along).'],
}

/** The Edit / Assign dialogs: each acts on the current selection and commits one undo step. */
export function EditDialog() {
  const kind = useAppStore((s) => s.editDialog)
  const setKind = useAppStore((s) => s.setEditDialog)
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => { if (!open) setKind(null) }}>
      {kind && (
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{TITLES[kind][0]}</DialogTitle>
            <DialogDescription>{TITLES[kind][1]}</DialogDescription>
          </DialogHeader>
          <EditForm key={kind} kind={kind} onDone={() => setKind(null)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function EditForm({ kind, onDone }: { kind: EditDialogKind; onDone: () => void }) {
  const s = useAppStore()
  const units = useUnits()
  const ndm = s.model.config?.ndm === 2 ? 2 : 3
  const ndf = s.model.config?.ndf ?? 6
  const sel = { nodes: s.selectedNodeIds, elements: s.selectedElementIds }
  const [text, setText] = useState<Record<string, string>>({ count: '1', n: '2', axis: '0', c: '0' })
  const [patternId, setPatternId] = useState(() => String([...s.model.patterns.keys()][0] ?? ''))
  const [error, setError] = useState('')
  const num = (key: string, cat: Category | null) => (cat ? units.parse(cat, text[key] ?? '0') : Number(text[key] ?? '0'))
  const field = (key: string, label: string, cat: Category | null) => (
    <label key={key} className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
      <span>{label}</span>
      <Input className="h-7 text-xs" value={text[key] ?? ''} placeholder={cat && units.active ? `0 ${units.symbol(cat)}` : '0'} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
    </label>
  )
  const axes = ndm === 3 ? ['x', 'y', 'z'] : ['x', 'y']
  const offset = (): P3 | null => { const v = axes.map((a) => num(`d${a}`, 'length')); return v.some((x) => x === null || !Number.isFinite(x)) ? null : [v[0]!, v[1]!, v[2] ?? 0] }
  const patterns = [...s.model.patterns.values()].filter((p) => p.patternType === 'Plain').map((p) => ({ value: String(p.id), label: p.name ?? `Pattern ${p.id}` }))
  const dofLabels = (ndm === 2 ? ['Fx', 'Fy', 'Mz'] : ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz']).slice(0, ndf)

  const apply = () => {
    setError('')
    const done = (msg: string) => { s.setStatus(msg); onDone() }
    if (kind === 'move' || kind === 'copy') {
      const d = offset()
      if (!d) return setError('Enter numbers for the offset.')
      if (kind === 'move') { s.editModel((m) => moveSelection(m, sel, translate(d))); return done('Moved the selection.') }
      const count = Math.round(Number(text.count))
      if (!(count >= 1 && count <= 100)) return setError('Copies must be between 1 and 100.')
      const r = copySelection(s.model, sel, translate(d), count)
      s.editModel(() => r.model)
      return done(`Copied ${r.elements.length} member${r.elements.length === 1 ? '' : 's'}${r.nodes.length ? ` and ${r.nodes.length} node${r.nodes.length === 1 ? '' : 's'}` : ''}.`)
    }
    if (kind === 'mirror') {
      const c = num('c', 'length')
      if (c === null) return setError('Enter the plane position.')
      const r = copySelection(s.model, sel, mirror(Number(text.axis) as 0 | 1 | 2, c))
      s.editModel(() => r.model)
      return done(`Mirrored ${r.elements.length} member${r.elements.length === 1 ? '' : 's'}.`)
    }
    if (kind === 'divide') {
      const n = Math.round(Number(text.n))
      if (!(n >= 2 && n <= 100)) return setError('Parts must be between 2 and 100.')
      const r = divideMembers(s.model, sel.elements, n)
      s.editModel(() => r.model)
      s.setSceneSelection({ nodes: [], elements: r.elements })
      return done(`Divided into ${r.elements.length} members.`)
    }
    const pid = Number(patternId)
    if (!s.model.patterns.has(pid)) return setError('Choose a load pattern.')
    if (kind === 'nodalLoad') {
      const values = dofLabels.map((l, i) => num(l, i < ndm ? 'force' : 'moment'))
      if (values.some((v) => v === null)) return setError('Enter numbers for the load.')
      s.writeModelEntities(nodalLoadWrites(pid, sel.nodes, values as number[]))
      return done(`Loaded ${sel.nodes.length} node${sel.nodes.length === 1 ? '' : 's'}.`)
    }
    const w = { wy: num('wy', 'forcePerLength'), wz: num('wz', 'forcePerLength'), wx: num('wx', 'forcePerLength') }
    if (w.wy === null || w.wz === null || w.wx === null) return setError('Enter numbers for the load.')
    s.writeModelEntities([memberLoadWrite(pid, sel.elements, w as { wy: number; wz: number; wx: number }, ndm)])
    done(`Loaded ${sel.elements.length} member${sel.elements.length === 1 ? '' : 's'}.`)
  }

  const isLoad = kind === 'nodalLoad' || kind === 'memberLoad'
  return (
    <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); apply() }}>
      {(kind === 'move' || kind === 'copy') && axes.map((a) => field(`d${a}`, `Δ${a}`, 'length'))}
      {kind === 'copy' && field('count', 'Copies', null)}
      {kind === 'mirror' && (
        <>
          <label className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
            <span>Plane</span>
            <Select items={axes.map((a, i) => ({ value: String(i), label: `${a} = constant` }))} value={text.axis} onValueChange={(v) => v && setText({ ...text, axis: v })}>
              <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{axes.map((a, i) => <SelectItem key={a} value={String(i)}>{a} = constant</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {field('c', 'At', 'length')}
        </>
      )}
      {kind === 'divide' && field('n', 'Parts', null)}
      {isLoad && (
        <label className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
          <span>Pattern</span>
          <Select items={patterns} value={patternId} onValueChange={(v) => setPatternId(v ?? '')}>
            <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue placeholder={patterns.length ? 'Load pattern' : 'No Plain load patterns yet'} /></SelectTrigger>
            <SelectContent>{patterns.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      )}
      {kind === 'nodalLoad' && dofLabels.map((l, i) => field(l, l, i < ndm ? 'force' : 'moment'))}
      {kind === 'memberLoad' && (ndm === 3 ? ['wy', 'wz', 'wx'] : ['wy', 'wx']).map((k) => field(k, k, 'forcePerLength'))}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm">Apply</Button>
      </DialogFooter>
    </form>
  )
}
