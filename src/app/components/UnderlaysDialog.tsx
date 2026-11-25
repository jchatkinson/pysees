import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { FileUp, Trash2, Link2, Ruler, Move, Crop, Maximize } from 'lucide-react'
import { useAppStore } from '@/app/store/useAppStore'
import type { UnderlayEntity } from '@/app/types/underlays'
import type { LevelEntity } from '@/app/types/levels'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Slider } from '@/app/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { useUnits } from '@/app/lib/units/useUnits'
import { lengthSi, type LengthUnit, type UnitContext } from '@/app/lib/units/units'
import { DRAWING_SCALES, POINT_M, parseDrawingScale, scaleFromRatio } from '@/app/lib/underlays/transform'
import { putPdf } from '@/app/lib/underlays/fileStore'
import { openPdf, pageSizes, renderPage, storedDoc } from '@/app/lib/underlays/pdfRender'

const BASE = 'base'
const levelKey = (id: number | null) => (id === null ? BASE : String(id))
const levelOf = (key: string) => (key === BASE ? null : Number(key))
const levelName = (levels: LevelEntity[], id: number | null) => (id === null ? 'Base' : levels.find((l) => l.id === id)?.label ?? '(deleted level)')

/** Text <-> scale. With units: a printed scale (`1/8" = 1'-0"`, `1:100`). Unitless: model units per paper inch. */
function scaleCodec(unit: LengthUnit | undefined) {
  if (!unit) return { format: (s: number) => String(Number((s * 72).toPrecision(8))), parse: (t: string) => { const n = Number(t); return Number.isFinite(n) && n > 0 ? n / 72 : null } }
  const named = [...DRAWING_SCALES.imperial, ...DRAWING_SCALES.metric]
  return {
    format: (s: number) => {
      const ratio = (s * lengthSi(unit)) / POINT_M
      return named.find((t) => Math.abs(parseDrawingScale(t)! / ratio - 1) < 1e-6) ?? `1:${Number(ratio.toPrecision(6))}`
    },
    parse: (t: string) => { const r = parseDrawingScale(t); return r ? scaleFromRatio(r, unit) : null },
  }
}

/** A text field that commits on Enter or blur and reverts when the text doesn't parse. */
function CommitInput({ value, onCommit, className, list }: { value: string; onCommit: (text: string) => boolean; className?: string; list?: string }) {
  // The text being typed; null shows the committed value.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null) }
  return <Input className={className} value={draft ?? value} list={list} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }} />
}

function LevelSelect({ value, levels, onChange }: { value: number | null; levels: LevelEntity[]; onChange: (id: number | null) => void }) {
  return (
    <Select value={levelKey(value)} onValueChange={(v) => v && onChange(levelOf(v))}>
      <SelectTrigger size="sm" className="w-full"><SelectValue>{levelName(levels, value)}</SelectValue></SelectTrigger>
      <SelectContent>
        <SelectItem value={BASE}>Base</SelectItem>
        {levels.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function ScaleList({ id, unit }: { id: string; unit: LengthUnit | undefined }) {
  if (!unit) return null
  const scales = unit === 'in' || unit === 'ft' ? [...DRAWING_SCALES.imperial, ...DRAWING_SCALES.metric] : [...DRAWING_SCALES.metric, ...DRAWING_SCALES.imperial]
  return <datalist id={id}>{scales.map((s) => <option key={s} value={s} />)}</datalist>
}

interface Pending { doc: PDFDocumentProxy; hash: string; fileName: string; sizes: [number, number][]; thumbs: string[]; pages: Set<number> }

/** Picks pages of a newly opened PDF, a level and a printed scale, and adds them as underlays. */
function ImportPanel({ pending, setPending, close, levels, units }: { pending: Pending; setPending: (p: Pending) => void; close: () => void; levels: LevelEntity[]; units: UnitContext }) {
  const addUnderlay = useAppStore((s) => s.addUnderlay)
  const planLevel = useAppStore((s) => (s.viewMode.kind === 'plan' && s.viewMode.level >= 0 ? s.levels[s.viewMode.level]?.id ?? null : null))
  const [level, setLevel] = useState<number | null>(planLevel)
  const unit = units.base?.length
  const codec = scaleCodec(unit)
  const [scaleText, setScaleText] = useState(unit ? (unit === 'in' || unit === 'ft' ? '1/8" = 1\'-0"' : '1:100') : '1')
  const scale = codec.parse(scaleText)
  const toggle = (p: number) => { const pages = new Set(pending.pages); if (pages.has(p)) pages.delete(p); else pages.add(p); setPending({ ...pending, pages }) }
  const add = () => {
    if (!scale) return
    for (const page of [...pending.pages].sort((a, b) => a - b)) {
      addUnderlay({
        name: pending.doc.numPages > 1 ? `${pending.fileName} p${page}` : pending.fileName, file: pending.hash, fileName: pending.fileName, page, pageSize: pending.sizes[page - 1],
        level, origin: [0, 0], scale, rotation: 0, opacity: 0.6, knockout: true, visible: true,
      })
    }
    close()
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">{pending.fileName} <span className="text-muted-foreground">({pending.doc.numPages} page{pending.doc.numPages > 1 ? 's' : ''})</span></div>
      <ScrollArea className="h-56 border">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-2">
          {pending.sizes.map((_, i) => (
            <button key={i} type="button" onClick={() => toggle(i + 1)} className={`flex flex-col items-center gap-1 border p-1 text-xs ${pending.pages.has(i + 1) ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
              {pending.thumbs[i] ? <img src={pending.thumbs[i]} alt={`Page ${i + 1}`} className="max-h-24 bg-white" /> : <div className="h-24 w-full bg-muted" />}
              Page {i + 1}
            </button>
          ))}
        </div>
      </ScrollArea>
      <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-sm">
        <span>Level</span>
        <LevelSelect value={level} levels={levels} onChange={setLevel} />
        <span>{unit ? 'Drawing scale' : 'Units per paper inch'}</span>
        <Input className="h-8" value={scaleText} list="underlay-scales-import" onChange={(e) => setScaleText(e.target.value)} aria-invalid={!scale} />
        <ScaleList id="underlay-scales-import" unit={unit} />
      </div>
      <p className="text-xs text-muted-foreground">Sheets are placed with their bottom-left corner at the origin. Check the printed scale: a sheet printed to fit the page needs a different one.</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
        <Button size="sm" disabled={!scale || pending.pages.size === 0} onClick={add}>Add {pending.pages.size || ''} sheet{pending.pages.size === 1 ? '' : 's'}</Button>
      </div>
    </div>
  )
}

function UnderlayRow({ u, levels, units, missing, onRelink }: { u: UnderlayEntity; levels: LevelEntity[]; units: UnitContext; missing: boolean; onRelink: () => void }) {
  const update = useAppStore((s) => s.updateUnderlay)
  const remove = useAppStore((s) => s.removeUnderlay)
  const startPick = useAppStore((s) => s.startUnderlayPick)
  const codec = scaleCodec(units.base?.length)
  const len = (v: number) => String(Number(units.toDisplay('length', v).toPrecision(10)))
  const setLen = (i: 0 | 1) => (t: string) => { const v = units.parse('length', t); if (v === null) return false; const origin: [number, number] = [...u.origin]; origin[i] = v; update(u.id, { origin }); return true }
  return (
    <div className="grid grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b py-1.5 text-sm">
      <Checkbox checked={u.visible} onCheckedChange={(c) => update(u.id, { visible: Boolean(c) })} aria-label="Visible" />
      <div className="min-w-0">
        <CommitInput className="h-7" value={u.name} onCommit={(t) => { if (!t.trim()) return false; update(u.id, { name: t.trim() }); return true }} />
        {missing && <button type="button" onClick={onRelink} className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 hover:underline"><Link2 className="size-3" />PDF not in this browser: relink {u.fileName}</button>}
      </div>
      <LevelSelect value={u.level} levels={levels} onChange={(level) => update(u.id, { level })} />
      <CommitInput className="h-7" value={codec.format(u.scale)} list="underlay-scales" onCommit={(t) => { const s = codec.parse(t); if (!s) return false; update(u.id, { scale: s }); return true }} />
      <CommitInput className="h-7" value={len(u.origin[0])} onCommit={setLen(0)} />
      <CommitInput className="h-7" value={len(u.origin[1])} onCommit={setLen(1)} />
      <CommitInput className="h-7" value={String(Number(((u.rotation * 180) / Math.PI).toPrecision(10)))} onCommit={(t) => { const d = Number(t); if (t.trim() === '' || !Number.isFinite(d)) return false; update(u.id, { rotation: (d * Math.PI) / 180 }); return true }} />
      <Slider min={0.05} max={1} step={0.05} value={[u.opacity]} onValueChange={(v) => update(u.id, { opacity: Array.isArray(v) ? v[0] : v })} aria-label="Opacity" />
      <Checkbox checked={u.knockout} onCheckedChange={(c) => update(u.id, { knockout: Boolean(c) })} aria-label="Knock out white" title="Knock out white paper" />
      <div className="flex">
        {([['calibrate', Ruler, 'Calibrate: pick two ends of a known dimension'], ['align', Move, 'Align: pick sheet points and where they go in the model'], ['crop', Crop, 'Crop: pick two corners of the region to keep']] as const).map(([kind, Icon, tip]) => (
          <Button key={kind} variant="ghost" size="icon-sm" disabled={missing} title={tip} aria-label={tip} onClick={() => startPick(u.id, kind)}><Icon /></Button>
        ))}
        {u.crop && <Button variant="ghost" size="icon-sm" title="Show the whole page" aria-label="Show the whole page" onClick={() => update(u.id, { crop: undefined })}><Maximize /></Button>}
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => remove(u.id)} aria-label="Delete underlay"><Trash2 /></Button>
    </div>
  )
}

export function UnderlaysDialog() {
  const open = useAppStore((s) => s.underlaysDialogOpen)
  const setOpen = useAppStore((s) => s.setUnderlaysDialogOpen)
  const underlays = useAppStore((s) => s.underlays)
  const levels = useAppStore((s) => s.levels)
  const update = useAppStore((s) => s.updateUnderlay)
  const units = useUnits()
  const fileInput = useRef<HTMLInputElement>(null)
  const relinkTarget = useRef<number | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())

  // Which referenced PDFs this browser doesn't have (a project opened elsewhere).
  const files = [...new Set(underlays.map((u) => u.file))].sort().join(',')
  useEffect(() => {
    if (!open || !files) return
    let alive = true
    void Promise.all(files.split(',').map(async (h) => [h, await storedDoc(h)] as const)).then((r) => { if (alive) setMissing(new Set(r.filter(([, d]) => !d).map(([h]) => h))) })
    return () => { alive = false }
  }, [open, files])

  // The import's own copy of the document; the viewport opens stored files separately.
  const closeImport = () => { void pending?.doc.loadingTask.destroy(); setPending(null) }

  const onFile = async (file: File) => {
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const doc = await openPdf(bytes)
      const hash = await putPdf(bytes, file.name)
      const sizes = await pageSizes(doc)
      const target = relinkTarget.current
      relinkTarget.current = null
      if (target !== null) {
        const u = underlays.find((x) => x.id === target)
        void doc.loadingTask.destroy()
        if (!u) return
        if (u.page > doc.numPages) { setError(`${file.name} has ${doc.numPages} page(s); this underlay uses page ${u.page}.`); return }
        // Every underlay that pointed at the lost file follows the relinked one.
        for (const x of underlays) if (x.file === u.file) update(x.id, { file: hash, fileName: file.name, pageSize: sizes[x.page - 1] ?? x.pageSize })
        setMissing((m) => { const n = new Set(m); n.delete(u.file); return n })
        return
      }
      const p: Pending = { doc, hash, fileName: file.name, sizes, thumbs: [], pages: new Set([1]) }
      setPending(p)
      for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
        const url = (await renderPage(doc, i, 160)).toDataURL('image/png')
        p.thumbs = [...p.thumbs]; p.thumbs[i - 1] = url
        setPending((cur) => (cur && cur.hash === hash ? { ...cur, thumbs: p.thumbs } : cur))
      }
    } catch (e) {
      setError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) closeImport() }}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>PDF underlays</DialogTitle>
          <DialogDescription>Drawing sheets shown under a level&apos;s plan to draw over. PDFs stay in this browser; saved projects only reference them.</DialogDescription>
        </DialogHeader>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {pending
          ? <ImportPanel pending={pending} setPending={setPending} close={closeImport} levels={levels} units={units} />
          : (
            <div className="flex flex-col">
              {underlays.length === 0
                ? <p className="py-6 text-center text-sm text-muted-foreground">No underlays yet. Import a PDF drawing to trace over it in plan.</p>
                : (
                  <>
                    <div className="grid grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1fr)_auto_auto_auto] gap-2 border-b pb-1 text-xs text-muted-foreground">
                      <span className="w-4" /><span>Name</span><span>Level</span><span>{units.base ? 'Scale' : 'Units / paper in'}</span>
                      <span>X{units.symbol('length') && ` (${units.symbol('length')})`}</span><span>Y{units.symbol('length') && ` (${units.symbol('length')})`}</span><span>Rotation (°)</span><span>Opacity</span><span title="Knock out white paper">White</span><span>Place</span><span className="w-7" />
                    </div>
                    <ScrollArea className="max-h-80">
                      {underlays.map((u) => <UnderlayRow key={u.id} u={u} levels={levels} units={units} missing={missing.has(u.file)} onRelink={() => { relinkTarget.current = u.id; fileInput.current?.click() }} />)}
                    </ScrollArea>
                    <ScaleList id="underlay-scales" unit={units.base?.length} />
                  </>
                )}
            </div>
          )}
        <DialogFooter>
          {!pending && <Button variant="outline" size="sm" onClick={() => { relinkTarget.current = null; fileInput.current?.click() }}><FileUp />Import PDF…</Button>}
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
