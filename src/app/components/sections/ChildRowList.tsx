import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { MaterialPicker } from '@/app/components/MaterialPicker'
import { NumberInput } from '@/app/components/SchemaFormField'
import { useUnits } from '@/app/lib/units/useUnits'
import type { Category } from '@/app/lib/units/units'
import type { FiberSectionItem } from '@/app/types/model'

const CELL_INPUT_CLASS = 'h-6 w-full min-w-12 px-1 text-[11px] border-input rounded-none bg-transparent focus-visible:border-ring focus-visible:ring-0 focus:outline-none'
const HEAD = 'h-6 px-1 text-[10px]'

export type AddKind = 'fiber' | 'rect' | 'circ'
type Col = { key: string; label: string; cat?: Category; int?: boolean }
type Group = { title: string; add: AddKind; match: (c: FiberSectionItem) => boolean; cols: Col[]; count?: (a: Record<string, unknown>) => number }

const num = (a: Record<string, unknown>, key: string) => Number(a[key]) || 0
const div = (a: Record<string, unknown>, key: string) => num(a, key) || 1

const GROUPS: Group[] = [
  { title: 'Fibers', add: 'fiber', match: (c) => c.kind === 'fiber', cols: [{ key: 'yloc', label: 'y', cat: 'length' }, { key: 'zloc', label: 'z', cat: 'length' }, { key: 'A', label: 'Area', cat: 'area' }] },
  { title: 'Rectangular patches', add: 'rect', match: (c) => c.kind === 'patch' && c.subType === 'rect', count: (a) => div(a, 'numSubdivY') * div(a, 'numSubdivZ'),
    cols: [{ key: 'y1', label: 'y1', cat: 'length' }, { key: 'z1', label: 'z1', cat: 'length' }, { key: 'y2', label: 'y2', cat: 'length' }, { key: 'z2', label: 'z2', cat: 'length' }, { key: 'numSubdivY', label: 'nY', int: true }, { key: 'numSubdivZ', label: 'nZ', int: true }] },
  { title: 'Circular patches', add: 'circ', match: (c) => c.kind === 'patch' && c.subType === 'circ', count: (a) => div(a, 'numSubdivCirc') * div(a, 'numSubdivRad'),
    cols: [{ key: 'yCenter', label: 'y c', cat: 'length' }, { key: 'zCenter', label: 'z c', cat: 'length' }, { key: 'intRad', label: 'r inner', cat: 'length' }, { key: 'extRad', label: 'r outer', cat: 'length' }, { key: 'numSubdivCirc', label: 'nCirc', int: true }, { key: 'numSubdivRad', label: 'nRad', int: true }] },
]
const known = (c: FiberSectionItem) => GROUPS.some((g) => g.match(c))

/** One cell: unit-aware float, or a positive-integer subdivision count (OpenSees rejects < 1). */
function ParamCell({ col, a, onChange }: { col: Col; a: Record<string, unknown>; onChange: (v: number) => void }) {
  const units = useUnits()
  if (col.int) return <input type="number" min={1} step={1} className={CELL_INPUT_CLASS} value={div(a, col.key)} onChange={(e) => onChange(Math.max(1, Math.round(Number(e.target.value)) || 1))} />
  return <NumberInput kind="float" value={num(a, col.key)} cat={col.cat} units={units} suffix={false} onCommit={onChange} className={CELL_INPUT_CLASS} />
}

function GroupTable({ group, rows, hoveredIndex, onHoverChild, onUpdateChild, onRemoveChild }: {
  group: Group
  rows: { c: FiberSectionItem; i: number }[]
  hoveredIndex: number | null
  onHoverChild: (index: number | null) => void
  onUpdateChild: (index: number, child: FiberSectionItem) => void
  onRemoveChild: (index: number) => void
}) {
  const units = useUnits()
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {group.cols.map((col) => { const sym = col.cat ? units.symbol(col.cat) : ''; return <TableHead key={col.key} className={HEAD}>{col.label}{sym && <span className="font-normal opacity-70"> ({sym})</span>}</TableHead> })}
          {group.count && <TableHead className={`${HEAD} w-12`}>Fibers</TableHead>}
          <TableHead className={`${HEAD} w-28`}>Material</TableHead>
          <TableHead className="h-6 px-1 w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ c, i }) => {
          const a = c.args
          return (
            <TableRow key={i} className={hoveredIndex === i ? 'bg-accent' : undefined} onMouseEnter={() => onHoverChild(i)} onMouseLeave={() => onHoverChild(null)}>
              {group.cols.map((col) => <TableCell key={col.key} className="p-1"><ParamCell col={col} a={a} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, [col.key]: v } })} /></TableCell>)}
              {group.count && <TableCell className="p-1 text-[11px] text-muted-foreground">{group.count(a)}</TableCell>}
              <TableCell className="p-1"><MaterialPicker value={Number(a.matTag) || null} onChange={(id) => onUpdateChild(i, { ...c, args: { ...a, matTag: id } })} className="h-6 text-[10px] w-full" /></TableCell>
              <TableCell className="p-1"><Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => onRemoveChild(i)}><Trash2 /></Button></TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** Editor for a section's fiber/patch children: one table per kind so column headers (with units) appear once. Bespoke typed inputs, not the generic ArgDef/SchemaFormField system: these are model data, not openseespy-call forms. Editing or adding a row here breaks the draft's link to its parametric template (see useSectionDraft). */
export function ChildRowList({ children, hoveredIndex, onHoverChild, onUpdateChild, onRemoveChild, onAdd }: {
  children: FiberSectionItem[]
  hoveredIndex: number | null
  onHoverChild: (index: number | null) => void
  onUpdateChild: (index: number, child: FiberSectionItem) => void
  onRemoveChild: (index: number) => void
  onAdd: (kind: AddKind) => void
}) {
  const indexed = children.map((c, i) => ({ c, i }))
  const other = indexed.filter(({ c }) => !known(c))
  return (
    <div className="grid gap-3">
      {GROUPS.map((g) => {
        const rows = indexed.filter(({ c }) => g.match(c))
        return (
          <div key={g.title} className="grid gap-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium">{g.title} <span className="text-muted-foreground font-normal">({rows.length})</span></div>
              <Button size="xs" variant="outline" onClick={() => onAdd(g.add)}><Plus />Add</Button>
            </div>
            {rows.length > 0 && <GroupTable group={g} rows={rows} hoveredIndex={hoveredIndex} onHoverChild={onHoverChild} onUpdateChild={onUpdateChild} onRemoveChild={onRemoveChild} />}
          </div>
        )
      })}
      {other.length > 0 && (
        <div className="grid gap-1">
          <div className="text-[11px] font-medium">Other</div>
          {other.map(({ c, i }) => (
            <div key={i} className="flex items-center gap-1 p-1" onMouseEnter={() => onHoverChild(i)} onMouseLeave={() => onHoverChild(null)}>
              <span className="text-[10px] font-mono text-muted-foreground flex-1 break-all">{c.kind}/{c.subType} {JSON.stringify(c.args)}</span>
              <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => onRemoveChild(i)}><Trash2 /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
