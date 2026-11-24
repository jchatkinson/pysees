import { useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore } from '@/app/store/useAppStore'
import { deleteEntity } from '@/app/lib/modelWrite'
import { deriveProperties, templateKey, templateOf } from '@/app/lib/editor/properties'
import { DrawBatch, isFrameTemplate, supportDofs, transfTypeFor } from '@/app/lib/editor/draw'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="grid gap-1.5 border-b px-3 py-2">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
    {children}
  </div>
)

/**
 * Properties of a multi-object selection: what is selected (by property), reassigning the frame property, supports for the selected
 * nodes, and delete. Every action is one undo step. A single object keeps its full form in `CommandForm` instead.
 */
export function SelectionPanel() {
  const model = useAppStore((s) => s.model)
  const nodeIds = useAppStore((s) => s.selectedNodeIds)
  const elementIds = useAppStore((s) => s.selectedElementIds)
  const setSceneSelection = useAppStore((s) => s.setSceneSelection)
  const writeModelEntities = useAppStore((s) => s.writeModelEntities)
  const editModel = useAppStore((s) => s.editModel)
  const deleteSelection = useAppStore((s) => s.deleteSelection)
  const clear = useAppStore((s) => s.clearSceneSelection)
  const [assignKey, setAssignKey] = useState('')
  const [preset, setPreset] = useState<'fixed' | 'pinned' | 'roller'>('fixed')

  const ndm = model.config?.ndm === 2 ? 2 : 3
  const props = useMemo(() => deriveProperties(model), [model])
  const selected = useMemo(() => new Set(elementIds), [elementIds])
  const groups = useMemo(() => props.map((p) => ({ p, ids: p.elementIds.filter((id) => selected.has(id)) })).filter((g) => g.ids.length > 0), [props, selected])
  const frameIds = useMemo(() => elementIds.filter((id) => { const e = model.elements.get(id); return e && e.nodes.length === 2 && isFrameTemplate(templateOf(e)) }), [elementIds, model])
  const framePropItems = props.filter((p) => p.kind === 'frame').map((p) => ({ value: p.key, label: p.name }))
  const supported = nodeIds.filter((id) => model.fixes.has(id)).length

  const assign = () => {
    const p = props.find((x) => x.key === assignKey)
    if (!p) return
    const t = { eleType: p.eleType, args: p.args }
    const b = new DrawBatch(model)
    const tt = transfTypeFor(model, p.elementIds.map((id) => model.elements.get(id)!).filter(Boolean))
    for (const id of frameIds) if (templateKey(templateOf(model.elements.get(id)!)) !== p.key) b.reassign(id, t, tt)
    writeModelEntities(b.writes)
  }
  const addSupports = () => {
    const b = new DrawBatch(model)
    for (const id of nodeIds) b.support(id, supportDofs(preset, ndm, model.config?.ndf ?? 6))
    writeModelEntities(b.writes)
  }
  const removeSupports = () => editModel((m) => nodeIds.reduce((acc, id) => (acc.fixes.has(id) ? deleteEntity(acc, 'fix', id) : acc), m))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-medium">{[nodeIds.length && `${nodeIds.length} node${nodeIds.length > 1 ? 's' : ''}`, elementIds.length && `${elementIds.length} element${elementIds.length > 1 ? 's' : ''}`].filter(Boolean).join(', ')} selected</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clear}>Clear</Button>
      </div>
      {groups.length > 0 && (
        <Section title="By property">
          {groups.map(({ p, ids }) => (
            <div key={p.key} className="flex items-center justify-between gap-2">
              <span className="truncate" title={p.name}>{p.name}</span>
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                {ids.length}
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[11px]" title="Keep only these selected" onClick={() => setSceneSelection({ nodes: [], elements: ids })}>Only</Button>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[11px]" title="Select every element with this property" onClick={() => setSceneSelection({ nodes: [], elements: p.elementIds })}>All</Button>
              </span>
            </div>
          ))}
        </Section>
      )}
      {frameIds.length > 0 && (
        <Section title={`Frame property (${frameIds.length})`}>
          <Select items={framePropItems} value={assignKey} onValueChange={(v) => setAssignKey(v ?? '')}>
            <SelectTrigger size="sm" className="h-7 w-full text-xs"><SelectValue placeholder="Assign a property…" /></SelectTrigger>
            <SelectContent>{framePropItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="h-6 text-xs" disabled={!assignKey} onClick={assign}>Assign to {frameIds.length} member{frameIds.length > 1 ? 's' : ''}</Button>
        </Section>
      )}
      {nodeIds.length > 0 && (
        <Section title={`Supports (${supported} of ${nodeIds.length} supported)`}>
          <div className="flex gap-1">
            <Select items={[{ value: 'fixed', label: 'Fixed' }, { value: 'pinned', label: 'Pinned' }, { value: 'roller', label: 'Roller' }]} value={preset} onValueChange={(v) => v && setPreset(v as typeof preset)}>
              <SelectTrigger size="sm" className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="pinned">Pinned</SelectItem>
                <SelectItem value="roller">Roller</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs" onClick={addSupports}>Assign</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={supported === 0} onClick={removeSupports}>Remove</Button>
          </div>
        </Section>
      )}
      <Section title="Edit">
        <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={deleteSelection}>Delete selection</Button>
        <p className="text-[11px] text-muted-foreground">{nodeIds.length ? 'Deleting a node also deletes its members, loads and support. ' : ''}Undo with Ctrl+Z.</p>
      </Section>
    </div>
  )
}
