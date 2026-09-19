import { useMemo, useState } from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { useAppStore } from '@/app/store/useAppStore'
import { alphaLabel, evenlySpacedGridlines } from '@/app/lib/gridlines'
import type { GridlineEntity } from '@/app/types/gridlines'

const AXIS_LABELS = ['X', 'Y', 'Z']
const PREVIEW_SIZE = 220
const CELL_INPUT_CLASS = 'h-6 px-1.5 text-xs border-transparent rounded-none bg-transparent hover:border-input focus-visible:border-ring focus-visible:ring-0'

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

  const [helperOpen, setHelperOpen] = useState(false)
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

  const labelPreview = useMemo(() => {
    const n = Math.min(count, 4)
    const labels = Array.from({ length: n }, (_, i) => {
      const label = labelStyle === 'alpha' ? alphaLabel(startIndex + i) : String(startIndex + i)
      return `${labelPrefix}${label}`
    })
    return labels.join(', ') + (count > n ? ', …' : '')
  }, [count, labelStyle, labelPrefix, startIndex])

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
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Gridlines</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 items-start flex-wrap">
          <div className="flex-1 min-w-[26rem] flex flex-col gap-4">
            <div className="border rounded-sm">
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left"
                onClick={() => setHelperOpen((v) => !v)}
              >
                <ChevronRight className={`size-3 shrink-0 text-muted-foreground transition-transform ${helperOpen ? 'rotate-90' : ''}`} />
                <span className="text-xs font-medium">Add evenly spaced gridlines</span>
                <span className="text-[10px] text-muted-foreground ml-1">generate several parallel lines at once</span>
              </button>

              {helperOpen && (
                <div className="border-t p-2.5 grid gap-3">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Placement</p>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Offset axis</Label>
                        <Select value={String(axis)} onValueChange={(v) => setAxis(Number(v))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: ndm }).map((_, i) => (
                              <SelectItem key={i} value={String(i)}>{AXIS_LABELS[i]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[9px] text-muted-foreground leading-tight">Lines are stacked along this axis</p>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Count</Label>
                        <Input type="number" className="h-7 text-xs" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
                        <p className="text-[9px] text-muted-foreground leading-tight">Number of lines</p>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Spacing</Label>
                        <Input type="number" className="h-7 text-xs" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} />
                        <p className="text-[9px] text-muted-foreground leading-tight">Distance between lines</p>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Starting at</Label>
                        <Input type="number" className="h-7 text-xs" value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
                        <p className="text-[9px] text-muted-foreground leading-tight">Position of the first line</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Extent (each line runs from → to)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1">
                        <Label className="text-[10px]">From</Label>
                        <CoordInputs value={spanStart} ndm={ndm} onChange={setSpanStart} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">To</Label>
                        <CoordInputs value={spanEnd} ndm={ndm} onChange={setSpanEnd} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Labels</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Style</Label>
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
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Prefix</Label>
                        <Input className="h-7 text-xs" value={labelPrefix} onChange={(e) => setLabelPrefix(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-tight mt-1">Will label: {labelPreview}</p>
                  </div>

                  <Button size="sm" className="w-fit" onClick={handleGenerate}>
                    Generate {count} gridline{count === 1 ? '' : 's'}
                  </Button>
                </div>
              )}
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
              <ScrollArea className="h-56 border rounded-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead rowSpan={2} className="h-6 px-1.5 text-[10px] align-bottom border-r">Label</TableHead>
                      <TableHead colSpan={ndm} className="h-6 px-1.5 text-[10px] text-center border-l">Start</TableHead>
                      <TableHead rowSpan={2} className="h-6 px-1 w-4" />
                      <TableHead colSpan={ndm} className="h-6 px-1.5 text-[10px] text-center border-l">End</TableHead>
                      <TableHead rowSpan={2} className="h-6 px-1.5 w-8" />
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      {Array.from({ length: ndm }).map((_, i) => (
                        <TableHead key={`s${i}`} className={`h-5 px-1.5 text-[9px] font-normal text-center text-muted-foreground ${i === 0 ? 'border-l' : ''}`}>
                          {AXIS_LABELS[i]}
                        </TableHead>
                      ))}
                      {Array.from({ length: ndm }).map((_, i) => (
                        <TableHead key={`e${i}`} className={`h-5 px-1.5 text-[9px] font-normal text-center text-muted-foreground ${i === 0 ? 'border-l' : ''}`}>
                          {AXIS_LABELS[i]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={2 * ndm + 3} className="text-xs text-muted-foreground text-center py-4">
                          No gridlines defined.
                        </TableCell>
                      </TableRow>
                    )}
                    {sorted.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="p-0.5 border-r">
                          <Input
                            className={CELL_INPUT_CLASS}
                            value={g.label}
                            onChange={(e) => updateGridline(g.id, { label: e.target.value })}
                          />
                        </TableCell>
                        {Array.from({ length: ndm }).map((_, i) => (
                          <TableCell key={`s${i}`} className={`p-0.5 ${i === 0 ? 'border-l' : ''}`}>
                            <Input
                              type="number"
                              className={CELL_INPUT_CLASS}
                              value={g.start[i] ?? 0}
                              onChange={(e) => {
                                const next = [...g.start]
                                while (next.length < ndm) next.push(0)
                                next[i] = Number(e.target.value)
                                updateGridline(g.id, { start: next })
                              }}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="p-0.5 text-center text-muted-foreground text-xs">→</TableCell>
                        {Array.from({ length: ndm }).map((_, i) => (
                          <TableCell key={`e${i}`} className={`p-0.5 ${i === 0 ? 'border-l' : ''}`}>
                            <Input
                              type="number"
                              className={CELL_INPUT_CLASS}
                              value={g.end[i] ?? 0}
                              onChange={(e) => {
                                const next = [...g.end]
                                while (next.length < ndm) next.push(0)
                                next[i] = Number(e.target.value)
                                updateGridline(g.id, { end: next })
                              }}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="p-0.5 text-right">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button size="icon-sm" variant="ghost" aria-label={`Remove gridline ${g.label}`} onClick={() => removeGridline(g.id)}>
                                  <Trash2 />
                                </Button>
                              }
                            />
                            <TooltipContent>Remove gridline</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
