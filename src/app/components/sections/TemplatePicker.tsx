import { Square, Circle as CircleIcon, RectangleHorizontal } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { MaterialPicker } from '@/app/components/MaterialPicker'
import { SECTION_TEMPLATES } from '@/app/lib/sections/templates'
import type {
  CShapeParams, CircleSectionParams, IShapeParams, LShapeParams, RectSectionParams, SectionTemplateKind, TubeParams,
} from '@/app/lib/sections/types'

function NumField({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px]">{label}</Label>
      <Input type="number" className="h-7 text-xs" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function MatField({ label, value, onChange }: { label: string; value: number | null; onChange: (id: number) => void }) {
  return (
    <div className="grid gap-1">
      <Label className="text-[10px]">{label}</Label>
      <MaterialPicker value={value} onChange={onChange} className="w-full h-7 text-xs" />
    </div>
  )
}

function RectForm({ p, onChange }: { p: RectSectionParams; onChange: (p: RectSectionParams) => void }) {
  const rebarOn = p.rebar !== null
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Width (y)" value={p.width} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, width: v })} />
        <NumField label="Depth (z)" value={p.depth} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, depth: v })} />
      </div>
      <MatField label="Core material" value={p.coreMatId || null} onChange={(id) => onChange({ ...p, coreMatId: id })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Fibers (y)" value={p.nSubdivY} min={1} onChange={(v) => onChange({ ...p, nSubdivY: Math.max(1, Math.trunc(v)) })} />
        <NumField label="Fibers (z)" value={p.nSubdivZ} min={1} onChange={(v) => onChange({ ...p, nSubdivZ: Math.max(1, Math.trunc(v)) })} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={rebarOn} onChange={(e) => onChange({ ...p, rebar: e.target.checked ? { matId: 0, barArea: 3.14e-4, cover: 0.04, nBarsY: 3, nBarsZ: 3 } : null })} />
        Rebar
      </label>
      {p.rebar && (
        <div className="grid gap-2 rounded border p-2">
          <MatField label="Rebar material" value={p.rebar.matId || null} onChange={(id) => onChange({ ...p, rebar: { ...p.rebar!, matId: id } })} />
          <div className="grid grid-cols-3 gap-2">
            <NumField label="Bar area" value={p.rebar.barArea} step={0.00001} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, barArea: v } })} />
            <NumField label="Cover" value={p.rebar.cover} step={0.005} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, cover: v } })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Bars along y" value={p.rebar.nBarsY} min={2} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, nBarsY: Math.max(2, Math.trunc(v)) } })} />
            <NumField label="Bars along z" value={p.rebar.nBarsZ} min={2} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, nBarsZ: Math.max(2, Math.trunc(v)) } })} />
          </div>
        </div>
      )}
    </div>
  )
}

function CircleForm({ p, onChange }: { p: CircleSectionParams; onChange: (p: CircleSectionParams) => void }) {
  return (
    <div className="grid gap-3">
      <NumField label="Diameter" value={p.diameter} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, diameter: v })} />
      <MatField label="Core material" value={p.coreMatId || null} onChange={(id) => onChange({ ...p, coreMatId: id })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Fibers (circ)" value={p.nSubdivCirc} min={3} onChange={(v) => onChange({ ...p, nSubdivCirc: Math.max(3, Math.trunc(v)) })} />
        <NumField label="Fibers (rad)" value={p.nSubdivRad} min={1} onChange={(v) => onChange({ ...p, nSubdivRad: Math.max(1, Math.trunc(v)) })} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={p.rebar !== null} onChange={(e) => onChange({ ...p, rebar: e.target.checked ? { matId: 0, barArea: 3.14e-4, cover: 0.04, nBars: 8 } : null })} />
        Rebar
      </label>
      {p.rebar && (
        <div className="grid gap-2 rounded border p-2">
          <MatField label="Rebar material" value={p.rebar.matId || null} onChange={(id) => onChange({ ...p, rebar: { ...p.rebar!, matId: id } })} />
          <div className="grid grid-cols-3 gap-2">
            <NumField label="Bar area" value={p.rebar.barArea} step={0.00001} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, barArea: v } })} />
            <NumField label="Cover" value={p.rebar.cover} step={0.005} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, cover: v } })} />
            <NumField label="# Bars" value={p.rebar.nBars} min={3} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, nBars: Math.max(3, Math.trunc(v)) } })} />
          </div>
        </div>
      )}
    </div>
  )
}

function PlateShapeForm({ p, onChange }: { p: IShapeParams | CShapeParams; onChange: (p: IShapeParams | CShapeParams) => void }) {
  return (
    <div className="grid gap-3">
      <MatField label="Material" value={p.matId || null} onChange={(id) => onChange({ ...p, matId: id })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Depth" value={p.depth} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, depth: v })} />
        <NumField label="Flange width" value={p.flangeWidth} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, flangeWidth: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Flange thickness" value={p.flangeThick} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, flangeThick: v })} />
        <NumField label="Web thickness" value={p.webThick} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, webThick: v })} />
      </div>
      <NumField label="Fibers per patch" value={p.nSubdiv} min={1} onChange={(v) => onChange({ ...p, nSubdiv: Math.max(1, Math.trunc(v)) })} />
    </div>
  )
}

function LShapeForm({ p, onChange }: { p: LShapeParams; onChange: (p: LShapeParams) => void }) {
  return (
    <div className="grid gap-3">
      <MatField label="Material" value={p.matId || null} onChange={(id) => onChange({ ...p, matId: id })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Leg (y)" value={p.legY} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, legY: v })} />
        <NumField label="Leg (z)" value={p.legZ} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, legZ: v })} />
      </div>
      <NumField label="Thickness" value={p.thickness} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, thickness: v })} />
      <NumField label="Fibers per patch" value={p.nSubdiv} min={1} onChange={(v) => onChange({ ...p, nSubdiv: Math.max(1, Math.trunc(v)) })} />
    </div>
  )
}

function TubeForm({ p, onChange }: { p: TubeParams; onChange: (p: TubeParams) => void }) {
  return (
    <div className="grid gap-3">
      <MatField label="Material" value={p.matId || null} onChange={(id) => onChange({ ...p, matId: id })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Diameter (outer)" value={p.diameter} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, diameter: v })} />
        <NumField label="Wall thickness" value={p.thickness} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, thickness: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Fibers (circ)" value={p.nSubdivCirc} min={3} onChange={(v) => onChange({ ...p, nSubdivCirc: Math.max(3, Math.trunc(v)) })} />
        <NumField label="Fibers (rad)" value={p.nSubdivRad} min={1} onChange={(v) => onChange({ ...p, nSubdivRad: Math.max(1, Math.trunc(v)) })} />
      </div>
    </div>
  )
}

const SHAPE_ICONS: Record<SectionTemplateKind, typeof Square> = {
  rect: Square, circle: CircleIcon, i: RectangleHorizontal, c: RectangleHorizontal, l: RectangleHorizontal, tube: CircleIcon,
}

/** Shape gallery + the selected shape's parametric form — each shape's fields are bespoke and typed (RectSectionParams, CircleSectionParams, ...), not driven by the generic openseespy ArgDef/CommandSchema system (fiber/patch/layer are model data, not generic command forms). */
export function TemplatePicker({ kind, params, onSelectKind, onChangeParams }: {
  kind: SectionTemplateKind | null
  params: Record<string, unknown> | null
  onSelectKind: (kind: SectionTemplateKind) => void
  onChangeParams: (params: Record<string, unknown>) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-6 gap-1.5">
        {Object.values(SECTION_TEMPLATES).map((tpl) => {
          const Icon = SHAPE_ICONS[tpl.kind]
          return (
            <Button
              key={tpl.kind}
              type="button"
              variant={kind === tpl.kind ? 'default' : 'outline'}
              className="h-14 flex-col gap-1 text-[10px]"
              onClick={() => onSelectKind(tpl.kind)}
            >
              <Icon className="size-4" />
              {tpl.label}
            </Button>
          )
        })}
      </div>
      {kind && params && (
        <>
          {kind === 'rect' && <RectForm p={params as unknown as RectSectionParams} onChange={(p) => onChangeParams(p as unknown as Record<string, unknown>)} />}
          {kind === 'circle' && <CircleForm p={params as unknown as CircleSectionParams} onChange={(p) => onChangeParams(p as unknown as Record<string, unknown>)} />}
          {(kind === 'i' || kind === 'c') && <PlateShapeForm p={params as unknown as IShapeParams} onChange={(p) => onChangeParams(p as unknown as Record<string, unknown>)} />}
          {kind === 'l' && <LShapeForm p={params as unknown as LShapeParams} onChange={(p) => onChangeParams(p as unknown as Record<string, unknown>)} />}
          {kind === 'tube' && <TubeForm p={params as unknown as TubeParams} onChange={(p) => onChangeParams(p as unknown as Record<string, unknown>)} />}
        </>
      )}
    </div>
  )
}
