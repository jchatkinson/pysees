import { useId } from 'react'
import { Square, Circle as CircleIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/app/components/ui/field'
import { AiscSectionPicker } from './AiscSectionPicker'
import { useAppStore } from '@/app/store/useAppStore'
import { Input } from '@/app/components/ui/input'
import { MaterialPicker } from '@/app/components/MaterialPicker'
import { SECTION_TEMPLATES, defaultMaterialId } from '@/app/lib/sections/templates'
import type {
  CShapeParams, ConcreteLShapeParams, WallRebarParams, DistributedRebarParams, EndRebarParams, HssParams, PlateMeshParams, CircleSectionParams, IShapeParams, LShapeParams, RectSectionParams, SectionTemplateKind, TubeParams,
} from '@/app/lib/sections/types'

function NumField({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="number" className="h-7 text-xs" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}

function MatField({ label, value, onChange }: { label: string; value: number | null; onChange: (id: number) => void }) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <MaterialPicker id={id} value={value} onChange={onChange} className="w-full h-7 text-xs" />
    </Field>
  )
}

function RectForm({ p, onChange }: { p: RectSectionParams; onChange: (p: RectSectionParams) => void }) {
  const materials = useAppStore((s) => s.model.materials)
  const rebarOn = p.rebar !== null
  return (
    <FieldGroup>
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label={`Width (${p.depthAxis === 'y' ? 'z' : 'y'})`} value={p.width} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, width: v })} />
        <NumField label={`Depth (${p.depthAxis === 'y' ? 'y' : 'z'})`} value={p.depth} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, depth: v })} />
      </FieldGroup>
      <MatField label="Core material" value={p.coreMatId || null} onChange={(id) => onChange({ ...p, coreMatId: id })} />
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label="Fibers (y)" value={p.nSubdivY} min={1} onChange={(v) => onChange({ ...p, nSubdivY: Math.max(1, Math.trunc(v)) })} />
        <NumField label="Fibers (z)" value={p.nSubdivZ} min={1} onChange={(v) => onChange({ ...p, nSubdivZ: Math.max(1, Math.trunc(v)) })} />
      </FieldGroup>
      <Field orientation="horizontal">
        <FieldLabel>
        <Checkbox checked={rebarOn} onCheckedChange={(checked) => onChange({ ...p, rebar: checked ? { matId: defaultMaterialId(materials, 'steel'), barArea: 3.14e-4, cover: 0.04, nBarsY: 3, nBarsZ: 3 } : null })} />
        Rebar
      </FieldLabel>
      </Field>
      {p.rebar && (
        <FieldGroup className="rounded border p-2">
          <MatField label="Rebar material" value={p.rebar.matId || null} onChange={(id) => onChange({ ...p, rebar: { ...p.rebar!, matId: id } })} />
          <FieldGroup className="grid grid-cols-3 gap-2">
            <NumField label="Bar area" value={p.rebar.barArea} step={0.00001} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, barArea: v } })} />
            <NumField label="Cover" value={p.rebar.cover} step={0.005} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, cover: v } })} />
          </FieldGroup>
          <FieldGroup className="grid grid-cols-2 gap-2">
            <NumField label="Bars along y" value={p.rebar.nBarsY} min={2} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, nBarsY: Math.max(2, Math.trunc(v)) } })} />
            <NumField label="Bars along z" value={p.rebar.nBarsZ} min={2} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, nBarsZ: Math.max(2, Math.trunc(v)) } })} />
          </FieldGroup>
        </FieldGroup>
      )}
    </FieldGroup>
  )
}

function CircleForm({ p, onChange }: { p: CircleSectionParams; onChange: (p: CircleSectionParams) => void }) {
  const materials = useAppStore((s) => s.model.materials)
  return (
    <FieldGroup>
      <NumField label="Diameter" value={p.diameter} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, diameter: v })} />
      <MatField label="Core material" value={p.coreMatId || null} onChange={(id) => onChange({ ...p, coreMatId: id })} />
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label="Fibers (circ)" value={p.nSubdivCirc} min={3} onChange={(v) => onChange({ ...p, nSubdivCirc: Math.max(3, Math.trunc(v)) })} />
        <NumField label="Fibers (rad)" value={p.nSubdivRad} min={1} onChange={(v) => onChange({ ...p, nSubdivRad: Math.max(1, Math.trunc(v)) })} />
      </FieldGroup>
      <Field orientation="horizontal">
        <FieldLabel>
        <Checkbox checked={p.rebar !== null} onCheckedChange={(checked) => onChange({ ...p, rebar: checked ? { matId: defaultMaterialId(materials, 'steel'), barArea: 3.14e-4, cover: 0.04, nBars: 8 } : null })} />
        Rebar
      </FieldLabel>
      </Field>
      {p.rebar && (
        <FieldGroup className="rounded border p-2">
          <MatField label="Rebar material" value={p.rebar.matId || null} onChange={(id) => onChange({ ...p, rebar: { ...p.rebar!, matId: id } })} />
          <FieldGroup className="grid grid-cols-3 gap-2">
            <NumField label="Bar area" value={p.rebar.barArea} step={0.00001} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, barArea: v } })} />
            <NumField label="Cover" value={p.rebar.cover} step={0.005} min={0} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, cover: v } })} />
            <NumField label="# Bars" value={p.rebar.nBars} min={3} onChange={(v) => onChange({ ...p, rebar: { ...p.rebar!, nBars: Math.max(3, Math.trunc(v)) } })} />
          </FieldGroup>
        </FieldGroup>
      )}
    </FieldGroup>
  )
}

function PlateShapeForm({ p, onChange }: { p: IShapeParams | CShapeParams; onChange: (p: IShapeParams | CShapeParams) => void }) {
  return (
    <FieldGroup>
      <MatField label="Material" value={p.matId || null} onChange={(id) => onChange({ ...p, matId: id })} />
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label={`Depth (${p.depthAxis === 'y' ? 'y' : 'z'})`} value={p.depth} step={0.01} min={0.01} onChange={(v) => onChange({ ...p, depth: v })} />
        <NumField label={`Flange width (${p.depthAxis === 'y' ? 'z' : 'y'})`} value={p.flangeWidth} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, flangeWidth: v })} />
      </FieldGroup>
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label="Flange thickness" value={p.flangeThick} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, flangeThick: v })} />
        <NumField label="Web thickness" value={p.webThick} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, webThick: v })} />
      </FieldGroup>
      <PlateMeshFields p={p} onChange={(mesh) => onChange({ ...p, ...mesh })} />
    </FieldGroup>
  )
}

function LShapeForm({ p, onChange }: { p: LShapeParams; onChange: (p: LShapeParams) => void }) {
  return (
    <FieldGroup>
      <MatField label="Material" value={p.matId || null} onChange={(id) => onChange({ ...p, matId: id })} />
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label={`Leg (${p.depthAxis === 'y' ? 'z' : 'y'})`} value={p.legY} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, legY: v })} />
        <NumField label={`Leg (${p.depthAxis === 'y' ? 'y' : 'z'})`} value={p.legZ} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, legZ: v })} />
      </FieldGroup>
      <NumField label="Thickness" value={p.thickness} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, thickness: v })} />
      <PlateMeshFields angle p={p} onChange={(mesh) => onChange({ ...p, ...mesh })} />
    </FieldGroup>
  )
}

function TubeForm({ p, onChange }: { p: TubeParams; onChange: (p: TubeParams) => void }) {
  return (
    <FieldGroup>
      <MatField label="Material" value={p.matId || null} onChange={(id) => onChange({ ...p, matId: id })} />
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label="Diameter (outer)" value={p.diameter} step={0.005} min={0.01} onChange={(v) => onChange({ ...p, diameter: v })} />
        <NumField label="Wall thickness" value={p.thickness} step={0.001} min={0.001} onChange={(v) => onChange({ ...p, thickness: v })} />
      </FieldGroup>
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label="Fibers (circ)" value={p.nSubdivCirc} min={3} onChange={(v) => onChange({ ...p, nSubdivCirc: Math.max(3, Math.trunc(v)) })} />
        <NumField label="Fibers (rad)" value={p.nSubdivRad} min={1} onChange={(v) => onChange({ ...p, nSubdivRad: Math.max(1, Math.trunc(v)) })} />
      </FieldGroup>
    </FieldGroup>
  )
}

function ShapeIcon({ kind }: { kind: SectionTemplateKind }) {
  if (kind === 'rect') return <Square data-icon="inline-start" />
  if (kind === 'circle' || kind === 'tube') return <CircleIcon data-icon="inline-start" />
  const path = kind === 'i' || kind === 'concreteI' ? 'M4 3h16v4h-6v10h6v4H4v-4h6V7H4Z'
    : kind === 'c' || kind === 'concreteC' ? 'M4 3h16v4H8v10h12v4H4Z'
    : kind === 'l' || kind === 'concreteL' ? 'M4 3h4v14h12v4H4Z'
    : 'M3 3h18v18H3ZM7 7v10h10V7Z'
  return <svg data-icon="inline-start" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden><path d={path} /></svg>
}

function PlateMeshFields({ p, onChange, angle = false }: { p: PlateMeshParams; onChange: (p: PlateMeshParams) => void; angle?: boolean }) {
  return <FieldSet>
    <FieldLegend>Fiber subdivisions</FieldLegend>
    <FieldGroup className="grid grid-cols-2 gap-2">
      {(['nWebY', 'nWebZ', 'nFlangeY', 'nFlangeZ'] as const).map((key, i) => <NumField key={key} label={(angle ? ['Vertical leg (y)', 'Vertical leg (z)', 'Horizontal leg (y)', 'Horizontal leg (z)'] : ['Web (y)', 'Web (z)', 'Flanges (y)', 'Flanges (z)'])[i]} value={p[key] ?? p.nSubdiv ?? 4} min={1} step={1} onChange={(v) => onChange({ ...p, [key]: Math.max(1, Math.trunc(v)) })} />)}
    </FieldGroup>
  </FieldSet>
}

function WallRebarFields({ label, value, onChange, concentrated = false }: {
  label: string; value: DistributedRebarParams | EndRebarParams | null
  onChange: (r: DistributedRebarParams | EndRebarParams | null) => void; concentrated?: boolean
}) {
  const materials = useAppStore((s) => s.model.materials)
  return <FieldSet>
    <FieldLegend>{label}</FieldLegend>
    <Field orientation="horizontal"><FieldLabel>
      <Checkbox checked={value !== null} onCheckedChange={(checked) => onChange(checked ? { matId: defaultMaterialId(materials, 'steel'), barArea: concentrated ? 0.0005 : 0.0002, cover: 0.05, spacing: concentrated ? 0.075 : 0.2, ...(concentrated ? { nBars: 3, junctions: true } : {}) } : null)} />Enable
    </FieldLabel></Field>
    {value && <>
      <MatField label="Steel material" value={value.matId || null} onChange={(matId) => onChange({ ...value, matId })} />
      <FieldGroup className="grid grid-cols-2 gap-2">
        <NumField label="Bar area" value={value.barArea} min={0} step={0.00001} onChange={(barArea) => onChange({ ...value, barArea })} />
        <NumField label="Cover to bar centre" value={value.cover} min={0} step={0.005} onChange={(cover) => onChange({ ...value, cover })} />
        <NumField label={concentrated ? 'Bar spacing in end group' : 'Maximum distributed spacing'} value={value.spacing} min={0.001} step={0.025} onChange={(spacing) => onChange({ ...value, spacing })} />
        {'nBars' in value && <NumField label="Bars per face at each end" value={value.nBars} min={1} step={1} onChange={(v) => onChange({ ...value, nBars: Math.max(1, Math.trunc(v)) })} />}
      </FieldGroup>
      {!concentrated && <p className="text-xs text-muted-foreground">Distributed along both wall faces, with spacing adjusted to fit between the end covers.</p>}
      {'nBars' in value && <>
        <Field orientation="horizontal"><FieldLabel><Checkbox checked={value.junctions ?? false} onCheckedChange={(junctions) => onChange({ ...value, junctions })} />Also reinforce wall junctions</FieldLabel></Field>
        <p className="text-xs text-muted-foreground">End groups run along both faces at the free wall tips and, when enabled, the wall junctions. They replace distributed bars within each group length.</p>
      </>}
    </>}
  </FieldSet>
}

function ConcreteWallRebarFields({ p, onChange, angle = false }: { p: WallRebarParams; onChange: (p: WallRebarParams) => void; angle?: boolean }) {
  return <FieldGroup>
    <WallRebarFields label={angle ? "Vertical leg distributed reinforcement" : "Web distributed reinforcement"} value={p.webRebar} onChange={(r) => onChange({ ...p, webRebar: r })} />
    <WallRebarFields label={angle ? "Horizontal leg distributed reinforcement" : "Flange distributed reinforcement"} value={p.flangeRebar} onChange={(r) => onChange({ ...p, flangeRebar: r })} />
    <WallRebarFields label="Concentrated end reinforcement" value={p.endRebar} concentrated onChange={(r) => onChange({ ...p, endRebar: r as EndRebarParams | null })} />
  </FieldGroup>
}

function ConcreteLForm({ p, onChange }: { p: ConcreteLShapeParams; onChange: (p: ConcreteLShapeParams) => void }) {
  return <FieldGroup>
    <MatField label="Concrete material" value={p.matId || null} onChange={(matId) => onChange({ ...p, matId })} />
    <FieldGroup className="grid grid-cols-2 gap-2">
      <NumField label={`Vertical leg (${p.depthAxis === 'y' ? 'y' : 'z'})`} value={p.legZ} min={0.01} step={0.1} onChange={(legZ) => onChange({ ...p, legZ })} />
      <NumField label={`Horizontal leg (${p.depthAxis === 'y' ? 'z' : 'y'})`} value={p.legY} min={0.01} step={0.1} onChange={(legY) => onChange({ ...p, legY })} />
      <NumField label="Web thickness" value={p.webThick} min={0.001} step={0.01} onChange={(webThick) => onChange({ ...p, webThick })} />
      <NumField label="Flange thickness" value={p.flangeThick} min={0.001} step={0.01} onChange={(flangeThick) => onChange({ ...p, flangeThick })} />
    </FieldGroup>
    <PlateMeshFields angle p={p} onChange={(mesh) => onChange({ ...p, ...mesh })} />
  </FieldGroup>
}

function HssForm({ p, onChange }: { p: HssParams; onChange: (p: HssParams) => void }) {
  return <FieldGroup>
    <MatField label="Steel material" value={p.matId || null} onChange={(matId) => onChange({ ...p, matId })} />
    <FieldGroup className="grid grid-cols-2 gap-2">
      <NumField label="Depth (y)" value={p.depth} min={0.01} step={0.01} onChange={(depth) => onChange({ ...p, depth })} />
      <NumField label="Width (z)" value={p.width} min={0.01} step={0.01} onChange={(width) => onChange({ ...p, width })} />
    </FieldGroup>
    <NumField label="Wall thickness" value={p.thickness} min={0.001} step={0.001} onChange={(thickness) => onChange({ ...p, thickness })} />
    <PlateMeshFields p={p} onChange={(mesh) => onChange({ ...p, ...mesh })} />
  </FieldGroup>
}

export function TemplatePicker({ kind, params, onSelectKind, onChangeParams }: {
  kind: SectionTemplateKind | null
  params: Record<string, unknown> | null
  onSelectKind: (kind: SectionTemplateKind, geometry?: Record<string, unknown>) => void
  onChangeParams: (params: Record<string, unknown>) => void
}) {
  const change = (p: object) => onChangeParams(p as Record<string, unknown>)
  return (
    <FieldGroup>
      {(['concrete', 'steel'] as const).map((family) => <FieldSet key={family}>
        <FieldLegend>{family === 'concrete' ? 'Concrete' : 'Steel'}</FieldLegend>
        <ToggleGroup variant="outline" value={kind && SECTION_TEMPLATES[kind].family === family ? [kind] : []} onValueChange={(values) => { if (values[0]) onSelectKind(values[0] as SectionTemplateKind) }} className="w-full flex-wrap" aria-label={`${family} section shape`}>
          {Object.values(SECTION_TEMPLATES).filter((tpl) => tpl.family === family).map((tpl) => <ToggleGroupItem key={tpl.kind} value={tpl.kind} className="h-14 flex-1 flex-col gap-1" aria-label={`${family} ${tpl.label}`}><ShapeIcon kind={tpl.kind} />{tpl.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </FieldSet>)}
      {kind && SECTION_TEMPLATES[kind].family === 'steel' && <AiscSectionPicker onApply={onSelectKind} />}
      {kind && params && <>
        {!!params.aiscName && <p className="text-xs text-muted-foreground">Based on {String(params.aiscName)} · dimensions in {String(params.lengthUnit)}</p>}
        {kind === 'rect' && <RectForm p={params as unknown as RectSectionParams} onChange={change} />}
        {kind === 'circle' && <CircleForm p={params as unknown as CircleSectionParams} onChange={change} />}
        {['i', 'c', 'concreteI', 'concreteC'].includes(kind) && <PlateShapeForm p={params as unknown as IShapeParams} onChange={change} />}
        {kind === 'l' && <LShapeForm p={params as unknown as LShapeParams} onChange={change} />}
        {kind === 'tube' && <TubeForm p={params as unknown as TubeParams} onChange={change} />}
        {kind === 'concreteL' && <ConcreteLForm p={params as unknown as ConcreteLShapeParams} onChange={change} />}
        {['concreteC', 'concreteI', 'concreteL'].includes(kind) && <ConcreteWallRebarFields p={params as unknown as WallRebarParams} onChange={change} angle={kind === 'concreteL'} />}
        {kind === 'hss' && <HssForm p={params as unknown as HssParams} onChange={change} />}
      </>}
    </FieldGroup>
  )
}
