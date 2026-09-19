import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { useAppStore } from '@/app/store/useAppStore'

const NEW_MATERIAL = '__new__'

/** A material picker sourced live from the model, with a trailing "New material" affordance that opens MaterialDialog. Since both read/write the same store, a material created mid-flow shows up here immediately. */
export function MaterialPicker({ kind = 'uniaxial', value, onChange, disabled, className }: {
  kind?: 'uniaxial' | 'nD'
  value: number | null
  onChange: (matId: number) => void
  disabled?: boolean
  className?: string
}) {
  // Select the stable Map reference and derive the filtered/sorted array in the component body — a selector that
  // returns a fresh array on every call breaks useSyncExternalStore's snapshot stability and infinite-loops.
  const materialsMap = useAppStore((s) => s.model.materials)
  const materials = useMemo(() => [...materialsMap.values()].filter((m) => m.kind === kind).sort((a, b) => a.id - b.id), [materialsMap, kind])
  const setMaterialDialogOpen = useAppStore((s) => s.setMaterialDialogOpen)

  return (
    <Select
      value={value !== null ? String(value) : ''}
      onValueChange={(v) => (v === NEW_MATERIAL ? setMaterialDialogOpen(true) : onChange(Number(v)))}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? 'w-full'}><SelectValue placeholder="Select material…" /></SelectTrigger>
      <SelectContent>
        {materials.map((m) => <SelectItem key={m.id} value={String(m.id)}>#{m.id} {m.matType}</SelectItem>)}
        {materials.length > 0 && <SelectSeparator />}
        <SelectItem value={NEW_MATERIAL}><Plus className="size-3.5" />New Material…</SelectItem>
      </SelectContent>
    </Select>
  )
}
