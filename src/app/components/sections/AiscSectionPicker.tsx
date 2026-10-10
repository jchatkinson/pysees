import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/app/components/ui/field'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/app/components/ui/combobox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { aiscGeometry, aiscTemplateKind, loadAiscSections, type AiscSection, type SectionLengthUnit } from '@/app/lib/sections/aisc'
import type { SectionTemplateKind } from '@/app/lib/sections/types'

const units = [{ value: 'm', label: 'Metres (m)' }, { value: 'mm', label: 'Millimetres (mm)' }, { value: 'in', label: 'Inches (in)' }, { value: 'ft', label: 'Feet (ft)' }]

export function AiscSectionPicker({ onApply }: { onApply: (kind: SectionTemplateKind, geometry: Record<string, unknown>) => void }) {
  const [sections, setSections] = useState<AiscSection[]>([])
  const [selected, setSelected] = useState<AiscSection | null>(null)
  const [unit, setUnit] = useState<SectionLengthUnit>('m')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadAiscSections().then((s) => { if (active) { setSections(s); setError('') } }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [attempt])
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>AISC v16 section</FieldLabel>
        <Combobox items={sections} value={selected} onValueChange={setSelected} itemToStringLabel={(s: AiscSection) => s.Name}>
          <ComboboxInput aria-label="AISC section" placeholder={sections.length ? 'Search W, C, L, HSS, or Pipe…' : 'Loading AISC sections…'} />
          <ComboboxContent>
            <ComboboxEmpty>No matching sections.</ComboboxEmpty>
            <ComboboxList>{(s: AiscSection) => <ComboboxItem key={s.Name} value={s}>{s.Name}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
      <Field>
        <FieldLabel>Model length units</FieldLabel>
        <Select items={units} value={unit} onValueChange={(v) => { if (v) setUnit(v as SectionLengthUnit) }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{units.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <p className="text-xs text-muted-foreground">Dimensions use your selected model units. Fiber patches approximate straight walls; rolled fillets, flange tapers, and HSS corner radii are omitted.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error} <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>Retry</Button></p>}
      <Button variant="outline" size="sm" disabled={!selected} onClick={() => {
        if (!selected) return
        try { onApply(aiscTemplateKind(selected)!, { ...aiscGeometry(selected, unit), aiscName: selected.Name, lengthUnit: unit }) } catch (e) { setError((e as Error).message) }
      }}>Use section geometry</Button>
    </FieldGroup>
  )
}
