import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { useAppStore } from '@/app/store/useAppStore'
import { evenlySpacedGridlines } from '@/app/lib/gridlines'
import type { GridlineEntity } from '@/app/types/gridlines'

const AXIS_LABELS = ['X', 'Y', 'Z']
const PREVIEW_SIZE = 220

function CoordInputs({
  value,
  ndm,
  onChange,
}: {
  value: number[]
  ndm: number
  onChange: (value: number[]) => void
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: ndm }).map((_, i) => (
        <Input
          key={i}
          type="number"
          className="h-7 w-16 text-xs px-1"
          value={value[i] ?? 0}
          onChange={(e) => {
            const next = [...value]
            while (next.length < ndm) next.push(0)
            next[i] = Number(e.target.value)
            onChange(next)
          }}
        />
      ))}
    </div>
  )
}

function GridPreview({ gridlines }: { gridlines: GridlineEntity[] }) {
  const pad = 22
  const bounds = useMemo(() => {
    const xs = gridlines.flatMap((g) => [g.start[0] ?? 0, g.end[0] ?? 0])
    const ys = gridlines.flatMap((g) => [g.start[1] ?? 0, g.end[1] ?? 0])
    const minX = xs.length ? Math.min(...xs) : 0
    const maxX = xs.length ? Math.max(...xs) : 1
    const minY = ys.length ? Math.min(...ys) : 0
    const maxY = ys.length ? Math.max(...ys) : 1
    return { minX, maxX: Math.max(maxX, minX + 1e-6), minY, maxY: Math.max(maxY, minY + 1e-6) }
  }, [gridlines])

  const scale = Math.min(
    (PREVIEW_SIZE - 2 * pad) / (bounds.maxX - bounds.minX),
    (PREVIEW_SIZE - 2 * pad) / (bounds.maxY - bounds.minY),
  )
  const project = (p: number[]): [number, number] => [
    pad + ((p[0] ?? 0) - bounds.minX) * scale,
    PREVIEW_SIZE - pad - ((p[1] ?? 0) - bounds.minY) * scale,
  ]

  return (
    <div className="shrink-0 flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
      <div
        className="border rounded-sm bg-muted/30 flex items-center justify-center overflow-hidden"
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      >
        {gridlines.length === 0 ? (
          <p className="text-xs text-muted-foreground px-6 text-center">No gridlines yet</p>
        ) : (
          <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE}>
            {gridlines.map((g) => {
              const [x1, y1] = project(g.start)
              const [x2, y2] = project(g.end)
              return (
                <g key={g.id}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
                  {[[x1, y1], [x2, y2]].map(([x, y], i) => (
                    <g key={i}>
                      <circle cx={x} cy={y} r={8} fill="white" stroke="#64748b" strokeWidth={1} />
                      <text x={x} y={y} fontSize={7.5} textAnchor="middle" dominantBaseline="central" fill="#0f172a">
                        {g.label}
                      </text>
                    </g>
                  ))}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">X/Y plan projection</p>
    </div>
  )
}

export function GridlinesDialog() {
  const open = useAppStore((s) => s.gridlinesDialogOpen)
  const setOpen = useAppStore((s) => s.setGridlinesDialogOpen)
  const gridlines = useAppStore((s) => s.gridlines)
  const addGridline = useAppStore((s) => s.addGridline)
  const updateGridline = useAppStore((s) => s.updateGridline)
  const removeGridline = useAppStore((s) => s.removeGridline)
  const setGridlines = useAppStore((s) => s.setGridlines)
  const nextGridlineId = useAppStore((s) => s.nextGridlineId)
  const ndm = useAppStore((s) => s.model.config?.ndm ?? 3)

  const [axis, setAxis] = useState(0)
  const [offset, setOffset] = useState(0)
  const [spacing, setSpacing] = useState(5)
  const [count, setCount] = useState(3)
  const [spanStart, setSpanStart] = useState<number[]>([0, 0, 0])
  const [spanEnd, setSpanEnd] = useState<number[]>([0, 10, 0])
  const [labelStyle, setLabelStyle] = useState<'numeric' | 'alpha'>('numeric')
  const [labelPrefix, setLabelPrefix] = useState('')
  const [startIndex, setStartIndex] = useState(1)

  const sorted = useMemo(() => [...gridlines].sort((a, b) => a.id - b.id), [gridlines])

  function handleGenerate() {
    const generated = evenlySpacedGridlines(
      {
        axis,
        offset,
        spacing,
        count,
        spanStart: spanStart.slice(0, ndm),
        spanEnd: spanEnd.slice(0, ndm),
        labelStyle,
        labelPrefix,
        startIndex,
      },
      nextGridlineId,
    )
    setGridlines([...gridlines, ...generated])
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gridlines</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 items-start flex-wrap">
          <div className="flex-1 min-w-72 flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Evenly Spaced Helper</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[10px]">Axis</Label>
                  <Select value={String(axis)} onValueChange={(v) => setAxis(Number(v))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: ndm }).map((_, i) => (
                        <SelectItem key={i} value={String(i)}>{AXIS_LABELS[i]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px]">Count</Label>
                  <Input type="number" className="h-7 text-xs" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px]">Spacing</Label>
                  <Input type="number" className="h-7 text-xs" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px]">First offset</Label>
                  <Input type="number" className="h-7 text-xs" value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px]">Label style</Label>
                  <Select value={labelStyle} onValueChange={(v) => setLabelStyle(v as 'numeric' | 'alpha')}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="numeric">1, 2, 3…</SelectItem>
                      <SelectItem value="alpha">A, B, C…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px]">Start index</Label>
                  <Input type="number" className="h-7 text-xs" value={startIndex} onChange={(e) => setStartIndex(Number(e.target.value))} />
                </div>
                <div className="grid gap-1 col-span-2">
                  <Label className="text-[10px]">Prefix</Label>
                  <Input className="h-7 text-xs" value={labelPrefix} onChange={(e) => setLabelPrefix(e.target.value)} />
                </div>
                <div className="grid gap-1 col-span-2">
                  <Label className="text-[10px]">Span start</Label>
                  <CoordInputs value={spanStart} ndm={ndm} onChange={setSpanStart} />
                </div>
                <div className="grid gap-1 col-span-2">
                  <Label className="text-[10px]">Span end</Label>
                  <CoordInputs value={spanEnd} ndm={ndm} onChange={setSpanEnd} />
                </div>
              </div>
              <Button size="sm" className="mt-2" onClick={handleGenerate}>
                Generate {count} gridline{count === 1 ? '' : 's'}
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gridlines ({sorted.length})</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => addGridline({ label: String(nextGridlineId), start: Array(ndm).fill(0), end: Array(ndm).fill(0) })}
                >
                  + Add custom
                </Button>
              </div>
              <ScrollArea className="h-48 border rounded-sm">
                <div className="p-2 flex flex-col gap-2">
                  {sorted.length === 0 && <p className="text-xs text-muted-foreground p-2">No gridlines defined.</p>}
                  {sorted.map((g) => (
                    <div key={g.id} className="flex items-center gap-1.5 border-b pb-2 last:border-b-0 last:pb-0">
                      <Input
                        className="h-7 w-14 text-xs px-1 shrink-0"
                        value={g.label}
                        onChange={(e) => updateGridline(g.id, { label: e.target.value })}
                      />
                      <CoordInputs value={g.start} ndm={ndm} onChange={(v) => updateGridline(g.id, { start: v })} />
                      <span className="text-muted-foreground text-xs shrink-0">→</span>
                      <CoordInputs value={g.end} ndm={ndm} onChange={(v) => updateGridline(g.id, { end: v })} />
                      <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={() => removeGridline(g.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <GridPreview gridlines={sorted} />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setGridlines([])} disabled={gridlines.length === 0}>
            Clear All
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
