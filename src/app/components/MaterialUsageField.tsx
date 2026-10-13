import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { MATERIAL_USAGES, USAGE_KEY, USAGE_LABEL, type MaterialUsage } from '@/app/lib/units/quantities'

const HINT: Record<MaterialUsage, string> = {
  'stress-strain': 'For fibers, patches, layers and trusses: stress against strain.',
  'force-deformation': 'For springs (zero-length): force against deformation. Fixed once the material is created.',
}

/** Form lead for a uniaxial material: how it is used. It decides the units of its stress, strain and modulus args, and cannot change after creation (`locked`). */
export function MaterialUsageField({ values, setValue, locked }: { values: Record<string, unknown>; setValue: (key: string, value: unknown) => void; locked?: boolean }) {
  const usage = (values[USAGE_KEY] as MaterialUsage | undefined) ?? 'stress-strain'
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">Used as</Label>
      <Select value={usage} onValueChange={(v) => v && setValue(USAGE_KEY, v)} disabled={locked}>
        <SelectTrigger className="w-full"><SelectValue>{USAGE_LABEL[usage]}</SelectValue></SelectTrigger>
        <SelectContent>{MATERIAL_USAGES.map((u) => <SelectItem key={u} value={u}>{USAGE_LABEL[u]}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">{HINT[usage]}</p>
    </div>
  )
}
