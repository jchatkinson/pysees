import { Fragment } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ArgDef, SchemaContext } from '@/types/schema'
import { resolveArgLen } from '@/lib/commandSchemas'

interface SchemaFormFieldProps {
  arg: ArgDef
  values: Record<string, unknown>
  setValue: (key: string, value: unknown) => void
  ctx: SchemaContext
  disabled?: boolean
}

function num(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function SchemaFormField({ arg, values, setValue, ctx, disabled }: SchemaFormFieldProps) {
  if (arg.kind === 'int' || arg.kind === 'float' || arg.kind === 'str') {
    const key = arg.name
    const label = arg.label ?? arg.name
    return (
      <div className="grid gap-1.5">
        <Label className="text-xs">{label}</Label>
        <Input
          type={arg.kind === 'str' ? 'text' : 'number'}
          value={String(values[key] ?? '')}
          onChange={(e) => setValue(key, arg.kind === 'str' ? e.target.value : Number(e.target.value))}
          disabled={disabled}
        />
      </div>
    )
  }
  if (arg.kind === 'vec') {
    const key = arg.name
    const len = resolveArgLen(arg.length, ctx)
    const arr = Array.isArray(values[key]) ? values[key] : Array.from({ length: len }, () => 0)
    const label = arg.label ?? arg.name
    return (
      <div className="grid gap-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(len, 6)}, minmax(0,1fr))` }}>
          {Array.from({ length: len }, (_, idx) => (
            <Input
              key={`${key}-${idx}`}
              type="number"
              value={String(arr[idx] ?? 0)}
              onChange={(e) => {
                const next = [...arr]
                next[idx] = num(e.target.value)
                setValue(key, next)
              }}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    )
  }
  if (arg.kind === 'flag') {
    const key = arg.flag
    const enabled = Boolean(values[key])
    return (
      <div className="grid gap-2 rounded border p-2">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setValue(key, e.target.checked)} disabled={disabled} />
          {arg.label ?? arg.flag}
        </label>
        {enabled && arg.args.map((child) => (
          <SchemaFormField key={child.kind === 'flag' ? child.flag : child.name} arg={child} values={values} setValue={setValue} ctx={ctx} disabled={disabled} />
        ))}
      </div>
    )
  }
  const key = arg.name
  const selected = String(values[key] ?? arg.options[0] ?? '')
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{arg.label ?? arg.name}</Label>
      <Select value={selected} onValueChange={(value) => setValue(key, value)} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {arg.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
      {(arg.yields[selected] ?? []).length > 0 && (
        <div className="grid gap-2 rounded border p-2">
          {(arg.yields[selected] ?? []).map((child) => (
            <Fragment key={child.kind === 'flag' ? child.flag : child.name}>
              <SchemaFormField arg={child} values={values} setValue={setValue} ctx={ctx} disabled={disabled} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

