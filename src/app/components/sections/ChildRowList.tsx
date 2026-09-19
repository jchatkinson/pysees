import { Trash2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { MaterialPicker } from '@/app/components/MaterialPicker'
import type { FiberSectionItem } from '@/app/types/model'

const CELL_INPUT_CLASS = 'h-6 w-16 px-1 text-[11px] border-transparent rounded-none bg-transparent hover:border-input focus-visible:border-ring focus-visible:ring-0 focus:outline-none'

function num(a: Record<string, unknown>, key: string) {
  return Number(a[key]) || 0
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" className={CELL_INPUT_CLASS} value={value} onChange={(e) => onChange(Number(e.target.value))} />
}

/** Row-level editor for a section's fiber/patch children — bespoke typed inputs per kind (not the generic ArgDef/SchemaFormField system: these are model data, not openseespy-call forms). Editing or adding a row here breaks the draft's link to its parametric template (see useSectionDraft). */
export function ChildRowList({ children, hoveredIndex, onHoverChild, onUpdateChild, onRemoveChild, onAddFiber }: {
  children: FiberSectionItem[]
  hoveredIndex: number | null
  onHoverChild: (index: number | null) => void
  onUpdateChild: (index: number, child: FiberSectionItem) => void
  onRemoveChild: (index: number) => void
  onAddFiber: () => void
}) {
  return (
    <div className="grid gap-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-6 px-1.5 text-[10px]">Kind</TableHead>
            <TableHead className="h-6 px-1.5 text-[10px]">Params</TableHead>
            <TableHead className="h-6 px-1.5 text-[10px] w-28">Material</TableHead>
            <TableHead className="h-6 px-1 w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {children.length === 0 && (
            <TableRow className="hover:bg-transparent"><TableCell colSpan={4} className="text-xs text-muted-foreground text-center py-4">No fibers/patches yet.</TableCell></TableRow>
          )}
          {children.map((c, i) => {
            const a = c.args
            return (
              <TableRow key={i} className={hoveredIndex === i ? 'bg-accent' : undefined} onMouseEnter={() => onHoverChild(i)} onMouseLeave={() => onHoverChild(null)}>
                <TableCell className="p-1 text-[10px] font-mono whitespace-nowrap">{c.kind}{c.subType !== 'fiber' ? `/${c.subType}` : ''}</TableCell>
                <TableCell className="p-1">
                  {c.kind === 'fiber' && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      y<NumCell value={num(a, 'yloc')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, yloc: v } })} />
                      z<NumCell value={num(a, 'zloc')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, zloc: v } })} />
                      A<NumCell value={num(a, 'A')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, A: v } })} />
                    </div>
                  )}
                  {c.kind === 'patch' && c.subType === 'rect' && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
                      y1<NumCell value={num(a, 'y1')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, y1: v } })} />
                      z1<NumCell value={num(a, 'z1')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, z1: v } })} />
                      y2<NumCell value={num(a, 'y2')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, y2: v } })} />
                      z2<NumCell value={num(a, 'z2')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, z2: v } })} />
                    </div>
                  )}
                  {c.kind === 'patch' && c.subType === 'circ' && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
                      r&#8321;<NumCell value={num(a, 'intRad')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, intRad: v } })} />
                      r&#8322;<NumCell value={num(a, 'extRad')} onChange={(v) => onUpdateChild(i, { ...c, args: { ...a, extRad: v } })} />
                    </div>
                  )}
                  {!(c.kind === 'fiber' || (c.kind === 'patch' && (c.subType === 'rect' || c.subType === 'circ'))) && (
                    <span className="text-[10px] font-mono text-muted-foreground">{JSON.stringify(a)}</span>
                  )}
                </TableCell>
                <TableCell className="p-1">
                  <MaterialPicker value={Number(a.matTag) || null} onChange={(id) => onUpdateChild(i, { ...c, args: { ...a, matTag: id } })} className="h-6 text-[10px] w-full" />
                </TableCell>
                <TableCell className="p-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => onRemoveChild(i)}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Button size="sm" variant="outline" className="w-fit" onClick={onAddFiber}>+ Add Fiber</Button>
    </div>
  )
}
