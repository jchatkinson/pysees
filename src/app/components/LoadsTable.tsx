import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table'
import { useAppStore } from '@/app/store/useAppStore'
import type { LoadAssignment } from '@/app/types/model'

const CELL_INPUT_CLASS = 'h-6 px-1.5 text-xs font-mono border-transparent rounded-none bg-transparent shadow-none hover:border-input focus-visible:border-ring focus-visible:ring-0'

/** A single editable cell: edits locally, commits on blur / Enter, reverts on Escape or invalid input. */
function NumCell({ value, integer, onCommit }: { value: number; integer?: boolean; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n) || (integer && (!Number.isInteger(n) || n < 1))) return setText(String(value))
    if (n !== value) onCommit(n)
  }
  return (
    <Input
      className={CELL_INPUT_CLASS}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setText(String(value)); e.currentTarget.blur() }
      }}
    />
  )
}

/** Editable table of a pattern's nodal loads (one row per node, one column per DOF). Non-nodal children are left to the caller. */
export function LoadsTable({ patternId, children, ndf }: { patternId: number; children: LoadAssignment[]; ndf: number }) {
  const writeModelEntity = useAppStore((s) => s.writeModelEntity)
  const removeModelEntityChild = useAppStore((s) => s.removeModelEntityChild)
  const rows = children.map((c, index) => ({ c, index })).filter(({ c }) => c.kind === 'load')

  const write = (index: number | undefined, nodeTag: number, values: number[]) =>
    writeModelEntity({ kind: 'patternChild', patternId, childIndex: index, child: { kind: 'load', args: { nodeTag, values } } })
  const valuesOf = (c: LoadAssignment) => Array.from({ length: ndf }, (_, i) => Number((c.args.values as number[] | undefined)?.[i] ?? 0))

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">Nodal Loads ({rows.length})</span>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => write(undefined, 1, Array(ndf).fill(0))}>
          <Plus className="size-3" /> Add
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="rounded border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-7 px-1.5 text-[10px]">Node</TableHead>
                {Array.from({ length: ndf }, (_, i) => <TableHead key={i} className="h-7 px-1.5 text-[10px]">DOF {i + 1}</TableHead>)}
                <TableHead className="w-6 p-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, index }) => {
                const vals = valuesOf(c)
                const node = Number(c.args.nodeTag)
                return (
                  // keyed by content so cells resync after undo/redo or edits elsewhere
                  <TableRow key={`${index}:${node}:${vals.join(',')}`}>
                    <TableCell className="p-0 min-w-14"><NumCell integer value={node} onCommit={(n) => write(index, n, vals)} /></TableCell>
                    {vals.map((v, d) => (
                      <TableCell key={d} className="p-0 min-w-16">
                        <NumCell value={v} onCommit={(n) => write(index, node, vals.map((x, k) => (k === d ? n : x)))} />
                      </TableCell>
                    ))}
                    <TableCell className="p-0 text-center">
                      <button className="text-muted-foreground hover:text-destructive p-1" aria-label="Remove load" onClick={() => removeModelEntityChild('pattern', patternId, index)}>
                        <X className="size-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
