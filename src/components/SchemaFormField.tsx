import { Fragment, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ArgDef, SchemaContext } from '@/types/schema'
import { resolveArgLen } from '@/lib/commandSchemas'
import { useAppStore } from '@/store/useAppStore'

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

function parseIds(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
}

// ─── idlist field ─────────────────────────────────────────────────────────────

function IdListField({
  arg,
  values,
  setValue,
  disabled,
}: Pick<SchemaFormFieldProps, 'arg' | 'values' | 'setValue' | 'disabled'>) {
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds)
  const setSelectedNodeIds = useAppStore((s) => s.setSelectedNodeIds)
  const setNodePickMode = useAppStore((s) => s.setNodePickMode)

  // rawText preserves in-progress input (e.g. "1, " while still typing "1, 2").
  // Using currentIds.join() directly as <Input value> would strip trailing punctuation on every keystroke.
  const initIds = Array.isArray(values[arg.name]) ? (values[arg.name] as number[]) : []
  const [rawText, setRawText] = useState<string>(() => initIds.join(', '))

  // Flag set when WE push a change to the store so the feedback effect doesn't overwrite rawText.
  // Start as true when editing (initIds non-empty) so the initial store-sync effect is skipped,
  // keeping rawText on the historical value rather than the current viewport selection.
  const isSelfUpdate = useRef(initIds.length > 0)

  // Activate pick mode while this field is mounted — no need to focus first.
  // When editing, sync the store to the historical IDs so the viewport highlights those nodes.
  useEffect(() => {
    setNodePickMode('idlist')
    if (initIds.length > 0) setSelectedNodeIds(initIds)
    return () => setNodePickMode('none')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When selectedNodeIds changes from an external source (viewport click / marquee),
  // update both the display text and the form value.
  useEffect(() => {
    if (isSelfUpdate.current) { isSelfUpdate.current = false; return }
    const text = selectedNodeIds.join(', ')
    setRawText(text)
    setValue(arg.name, selectedNodeIds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIds])

  const handleChange = (text: string) => {
    setRawText(text)
    const parsed = parseIds(text)
    setValue(arg.name, parsed)
    isSelfUpdate.current = true
    setSelectedNodeIds(parsed)
  }

  const label = arg.kind === 'idlist' ? (arg.label ?? arg.name) : arg.name

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="text"
        value={rawText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="1, 2, 3 — or click nodes"
        disabled={disabled}
      />
      <p className="text-[10px] text-muted-foreground -mt-1">
        Click nodes in viewport · Shift+click to add
      </p>
    </div>
  )
}

// ─── vec field with optional nodeSync ─────────────────────────────────────────

function VecField({
  arg,
  values,
  setValue,
  ctx,
  disabled,
}: SchemaFormFieldProps & { arg: Extract<ArgDef, { kind: 'vec' }> }) {
  const pendingNodePick = useAppStore((s) => s.pendingNodePick)
  const setPendingNodePick = useAppStore((s) => s.setPendingNodePick)
  const setNodePickMode = useAppStore((s) => s.setNodePickMode)

  const len = resolveArgLen(arg.length, ctx)
  const arr = Array.isArray(values[arg.name]) ? (values[arg.name] as unknown[]) : []
  const label = arg.label ?? arg.name

  const [nextSlot, setNextSlot] = useState(0)
  const activeRef = useRef(false)

  // When a pending pick arrives while this vec field is active, fill the next slot
  useEffect(() => {
    if (!arg.nodeSync || pendingNodePick === null || !activeRef.current || len === 'dynamic') return
    const fixed = arr.length ? [...arr] : Array.from({ length: len }, () => 0)
    fixed[nextSlot] = pendingNodePick
    setValue(arg.name, fixed)
    setNextSlot((s) => (s + 1) % (len as number))
    setPendingNodePick(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNodePick])

  if (len === 'dynamic') {
    return (
      <div className="grid gap-1.5">
        <Label className="text-xs">{label}</Label>
        <Input
          type="text"
          value={arr.join(', ')}
          onChange={(e) => {
            const next = e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
              .map((v) => num(v))
            setValue(arg.name, next)
          }}
          placeholder="e.g. 1, 2, 3"
          disabled={disabled}
        />
      </div>
    )
  }

  const fixed = arr.length ? arr : Array.from({ length: len }, () => 0)

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.min(len, 6)}, minmax(0,1fr))` }}
        onBlur={(e) => {
          if (arg.nodeSync && !e.currentTarget.contains(e.relatedTarget as Node)) {
            activeRef.current = false
            setNodePickMode('none')
          }
        }}
      >
        {Array.from({ length: len }, (_, idx) => (
          <Input
            key={`${arg.name}-${idx}`}
            type="number"
            value={String(fixed[idx] ?? 0)}
            onChange={(e) => {
              const next = [...fixed]
              next[idx] = num(e.target.value)
              setValue(arg.name, next)
            }}
            onFocus={() => {
              if (arg.nodeSync) {
                activeRef.current = true
                setNextSlot(idx)
                setNodePickMode('vec-sequential')
              }
            }}
            disabled={disabled}
          />
        ))}
      </div>
      {arg.nodeSync && activeRef.current && (
        <p className="text-[10px] text-muted-foreground">
          Click nodes in viewport to fill sequentially
        </p>
      )}
    </div>
  )
}

// ─── main field dispatcher ────────────────────────────────────────────────────

export function SchemaFormField({ arg, values, setValue, ctx, disabled }: SchemaFormFieldProps) {
  if (arg.kind === 'idlist') {
    return <IdListField arg={arg} values={values} setValue={setValue} disabled={disabled} />
  }
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
    return <VecField arg={arg} values={values} setValue={setValue} ctx={ctx} disabled={disabled} />
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
  if (arg.kind === 'choice') {
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
            {arg.options.map((option: string) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
        {(arg.yields[selected] ?? []).length > 0 && (
          <div className="grid gap-2 rounded border p-2">
            {(arg.yields[selected] ?? []).map((child: ArgDef) => (
              <Fragment key={child.kind === 'flag' ? child.flag : child.name}>
                <SchemaFormField arg={child} values={values} setValue={setValue} ctx={ctx} disabled={disabled} />
              </Fragment>
            ))}
          </div>
        )}
      </div>
    )
  }
  return null
}
