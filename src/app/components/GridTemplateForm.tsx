import { useState } from 'react'
import { useAppStore } from '@/app/store/useAppStore'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Button } from '@/app/components/ui/button'
import { UNIT_PRESETS, makeUnitContext, type BaseUnits } from '@/app/lib/units/units'
import { gridTemplate, parseSpacings } from '@/app/lib/gridTemplate'

const NO_UNITS = 'none'
type Field = 'x' | 'y' | 'stories'

/** Starting spacings, written with their unit so they mean the same whatever the model's base unit. */
function defaults(units: BaseUnits | undefined): Record<Field, string> {
  if (!units) return { x: '3@8', y: '2@7', stories: '4.5, 3@3.6' }
  if (units.length === 'in' || units.length === 'ft') return { x: '3@30 ft', y: '2@25 ft', stories: '15 ft, 3@12 ft' }
  return { x: '3@8 m', y: '2@7 m', stories: '4.5 m, 3@3.6 m' }
}

/** Plan of the grids with their bubbles (3D), or the frame lines and levels in elevation (2D). */
function GridPreview({ ndm, xs, ys, levels }: { ndm: 2 | 3; xs: number[]; ys: number[]; levels: number[] }) {
  const W = 300, H = 150, pad = 18
  const vs = ndm === 3 ? ys : levels
  const spanX = xs[xs.length - 1] || 1, spanV = vs[vs.length - 1] || 1
  const k = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanV)
  const ox = (W - spanX * k) / 2, oy = (H + spanV * k) / 2
  const X = (v: number) => ox + v * k, Y = (v: number) => oy - v * k
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-sm border bg-muted/40 text-muted-foreground" aria-label="Grid preview">
      {xs.map((x, i) => (
        <g key={`x${i}`}>
          <line x1={X(x)} x2={X(x)} y1={Y(spanV) - 8} y2={Y(0) + (ndm === 3 ? 8 : 0)} stroke="currentColor" strokeDasharray={ndm === 3 ? '4 3' : undefined} />
          <circle cx={X(x)} cy={Y(spanV) - 13} r={6} fill="var(--background)" stroke="currentColor" />
          <text x={X(x)} y={Y(spanV) - 10.5} fontSize={7} textAnchor="middle" fill="currentColor">{i + 1}</text>
        </g>
      ))}
      {vs.map((v, i) => (
        <g key={`v${i}`}>
          <line x1={X(0) - (ndm === 3 ? 8 : 0)} x2={X(spanX) + 8} y1={Y(v)} y2={Y(v)} stroke="currentColor" strokeDasharray={ndm === 3 || i === 0 ? '4 3' : undefined} />
          <text x={X(spanX) + 11} y={Y(v) + 2.5} fontSize={7} fill="currentColor">{ndm === 3 ? String.fromCharCode(65 + (i % 26)) : i === 0 ? 'Base' : `L${i}`}</text>
        </g>
      ))}
    </svg>
  )
}

/** "Grid only": an empty model with grid lines and story levels from spacing lists, ready to draw on. */
export function GridTemplateForm() {
  const initModel = useAppStore((s) => s.initModel)
  const [ndm, setNdm] = useState<2 | 3>(3)
  const [preset, setPreset] = useState('kip-in-s')
  const units = UNIT_PRESETS.find((p) => p.id === preset)?.units
  const [text, setText] = useState<Partial<Record<Field, string>>>({})
  const shown = { ...defaults(units), ...text }
  const ctx = makeUnitContext(units)
  const parse = (f: Field) => parseSpacings(shown[f], (t) => ctx.parse('length', t))
  const x = parse('x'), y = parse('y'), stories = parse('stories')
  const ok = x !== null && x.length > 0 && stories !== null && (ndm === 2 || (y !== null && y.length > 0))
  const cum = (s: number[] | null) => (s ?? []).reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + d], [0])
  const unit = ctx.symbol('length')

  const create = () => {
    if (!ok) return
    const t = gridTemplate({ ndm, x, y: y ?? [], stories })
    initModel(ndm, ndm === 3 ? 6 : 3, { units, gridlines: t.gridlines, levels: t.levels })
  }
  const field = (f: Field, label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input value={shown[f]} onChange={(e) => setText({ ...text, [f]: e.target.value })} aria-invalid={parse(f) === null} />
    </div>
  )

  return (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Dimensions</Label>
          <Select value={String(ndm)} onValueChange={(v) => setNdm(Number(v) === 2 ? 2 : 3)}>
            <SelectTrigger className="w-full"><SelectValue>{ndm === 3 ? '3D (Z up)' : '2D (XY plane)'}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="3">3D (Z up)</SelectItem><SelectItem value="2">2D (XY plane)</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Units (fixed for the model)</Label>
          <Select value={preset} onValueChange={(v) => { setPreset(v ?? NO_UNITS); setText({}) }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNIT_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              <SelectItem value={NO_UNITS}>None (plain numbers)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {field('x', ndm === 3 ? 'X spacings (grids 1, 2, …)' : 'Bay widths (grids 1, 2, …)')}
        {ndm === 3 ? field('y', 'Y spacings (grids A, B, …)') : <div />}
        <div className="col-span-2">{field('stories', 'Story heights, bottom up')}</div>
      </div>
      <GridPreview ndm={ndm} xs={cum(x)} ys={cum(y)} levels={cum(stories)} />
      <p className="text-xs text-muted-foreground">
        Lists like <code>3@30 ft, 24 ft</code> (three bays of 30 ft, then one of 24 ft). {unit ? `Bare numbers are in ${unit}.` : 'Plain numbers, in your own consistent units.'}
        {' '}The model starts empty: draw members, shells and walls on the grids from the Model tab. Grids and levels stay editable in Model › Grids &amp; levels.
      </p>
      <div className="flex justify-end"><Button disabled={!ok} onClick={create}>Create Model</Button></div>
    </div>
  )
}
