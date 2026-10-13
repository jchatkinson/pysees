import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/app/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/app/components/ui/input-group'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import type { ArgDef, SchemaContext } from '@/app/types/schema'
import { resolveArgLen } from '@/app/lib/commandSchemas'
import { useAppStore } from '@/app/store/useAppStore'
import { CircleHelp } from 'lucide-react'
import { useUnits } from '@/app/lib/units/useUnits'
import { formatQuantity, snapQuantity, type Category, type UnitContext } from '@/app/lib/units/units'
import { resolveQty, USAGE_KEY, type MaterialUsage } from '@/app/lib/units/quantities'

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

function isTransientNumericText(text: string) {
  return text === '' || text === '-' || text === '.' || text === '-.'
}

function parseCommittedNumber(text: string) {
  if (isTransientNumericText(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function normalizeCommittedNumber(n: number, kind: 'int' | 'float') {
  return kind === 'int' ? Math.trunc(n) : n
}

export function NumberInput({
  value,
  kind,
  onCommit,
  disabled,
  onFocus,
  cat,
  units,
  suffix = true,
  className,
}: {
  value: unknown
  kind: 'int' | 'float'
  onCommit: (value: number) => void
  disabled?: boolean
  onFocus?: () => void
  /** Quantity of the value (stored in base units). With active units the field shows and accepts the display unit, and a typed unit (`4 ft`) converts. */
  cat?: Category | null
  units?: UnitContext
  /** Show the unit inside the field; off where the caller labels units itself (vec cells). */
  suffix?: boolean
  className?: string
}) {
  const scaled = Boolean(units?.active && cat && kind === 'float')
  const show = (v: number) => (scaled ? formatQuantity(units!.toDisplay(cat, v)) : String(v))
  const read = (text: string) => (scaled ? units!.parse(cat, text) : parseCommittedNumber(text))
  const commit = (n: number) => (scaled ? snapQuantity(n) : normalizeCommittedNumber(n, kind))
  const committed = num(value)
  const [draft, setDraft] = useState(show(committed))
  const [focused, setFocused] = useState(false)

  const [prevCommitted, setPrevCommitted] = useState(committed)
  if (committed !== prevCommitted) {
    setPrevCommitted(committed)
    if (!focused) setDraft(show(committed))
  }

  const sym = scaled && suffix ? units!.symbol(cat) : ''
  const props = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value
      setDraft(text)
      const parsed = read(text)
      if (parsed !== null) onCommit(commit(parsed))
    },
    onFocus: () => {
      setFocused(true)
      onFocus?.()
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false)
      const text = e.target.value
      // Untouched text keeps the stored value exactly, so opening and leaving a field never changes a number by float noise.
      if (text === show(committed)) return setDraft(text)
      const parsed = read(text)
      if (parsed === null) return setDraft(show(committed))
      const normalized = commit(parsed)
      onCommit(normalized)
      setDraft(show(normalized))
    },
    disabled,
    className,
  }
  if (!sym) return <Input type={scaled ? 'text' : 'number'} inputMode={scaled ? 'decimal' : undefined} {...props} />
  return (
    <InputGroup>
      <InputGroupInput type="text" inputMode="decimal" {...props} />
      <InputGroupAddon align="inline-end"><InputGroupText>{sym}</InputGroupText></InputGroupAddon>
    </InputGroup>
  )
}

function parseIds(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
}

function tryParseDynamicFloatList(text: string): number[] | null {
  const tokens = text.split(',').map((s) => s.trim())
  const out: number[] = []
  for (const token of tokens) {
    if (!token) continue
    if (isTransientNumericText(token)) return null
    const n = Number(token)
    if (!Number.isFinite(n)) return null
    out.push(n)
  }
  return out
}

function seedDefaults(arg: ArgDef, values: Record<string, unknown>, setValue: (key: string, value: unknown) => void, ctx: SchemaContext) {
  if (arg.kind === 'int' || arg.kind === 'float') {
    // No default means the field starts blank (and, if required, fails validation) rather than a misleading 0.
    if (values[arg.name] === undefined && arg.defaultValue !== undefined) setValue(arg.name, Number(arg.defaultValue))
    return
  }
  if (arg.kind === 'str') {
    if (arg.name === 'literal') return
    if (values[arg.name] === undefined) setValue(arg.name, String(arg.defaultValue ?? ''))
    return
  }
  if (arg.kind === 'vec') {
    if (values[arg.name] !== undefined) return
    const len = resolveArgLen(arg.length, ctx)
    if (len === 'dynamic') setValue(arg.name, [...(arg.defaultValue ?? [])])
    else setValue(arg.name, Array.from({ length: len }, (_, i) => arg.defaultValue?.[i] ?? 0))
    return
  }
  if (arg.kind === 'flag') {
    if (values[arg.flag] === undefined) setValue(arg.flag, Boolean(arg.defaultValue))
    for (const child of arg.args) seedDefaults(child, values, setValue, ctx)
    return
  }
  if (arg.kind === 'choice') {
    const selected = String(values[arg.name] ?? arg.defaultValue ?? arg.options[0] ?? '')
    if (values[arg.name] === undefined) setValue(arg.name, selected)
    for (const child of arg.yields[selected] ?? []) seedDefaults(child, values, setValue, ctx)
    return
  }
  if (arg.kind === 'idlist' && values[arg.name] === undefined) setValue(arg.name, arg.defaultValue ?? [])
}

function FieldLabel({ text, description, unit }: { text: string; description?: string; unit?: string }) {
  return (
    <Label className="text-xs flex items-center gap-1.5">
      <span>{text}</span>
      {unit && <span className="text-muted-foreground font-normal">({unit})</span>}
      {description && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button type="button" className="text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={`${text} info`}>
                <CircleHelp className="size-3" />
              </button>
            }
          />
          <TooltipContent side="top">{description}</TooltipContent>
        </Tooltip>
      )}
    </Label>
  )
}

// ─── idlist field ─────────────────────────────────────────────────────────────

function IdListField({
  arg,
  values,
  setValue,
  disabled,
}: Pick<SchemaFormFieldProps, 'values' | 'setValue' | 'disabled'> & {
  arg: Extract<ArgDef, { kind: 'idlist' }>
}) {
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
      <FieldLabel text={label} description={arg.description} />
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
  const rawVec = values[arg.name]
  const arr = useMemo(() => (Array.isArray(rawVec) ? (rawVec as unknown[]) : []), [rawVec])
  const label = arg.label ?? arg.name
  const units = useUnits()
  const qctx = { ndm: ctx.ndm, usage: values[USAGE_KEY] as MaterialUsage | undefined }
  const catAt = (i: number) => resolveQty(arg.qty, qctx, i)
  const symAt = (i: number) => units.symbol(catAt(i))

  const [nextSlot, setNextSlot] = useState(0)
  const activeRef = useRef(false)
  const [active, setActive] = useState(false)
  const formattedVec = arr.map((v, i) => formatQuantity(units.toDisplay(catAt(i), num(v)))).join(', ')
  const [dynamicOverride, setDynamicOverride] = useState<string | null>(null)
  const dynamicRaw = dynamicOverride ?? formattedVec

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
        <FieldLabel text={label} description={arg.description} unit={[...new Set(arr.map((_, i) => symAt(i)).filter(Boolean))].join(', ') || undefined} />
        <Input
          type="text"
          value={dynamicRaw}
          onChange={(e) => {
            const text = e.target.value
            setDynamicOverride(text)
            const parsed = tryParseDynamicFloatList(text)
            if (parsed) setValue(arg.name, parsed.map((v, i) => snapQuantity(units.fromDisplay(catAt(i), v))))
          }}
          onFocus={() => setDynamicOverride(dynamicRaw)}
          onBlur={() => {
            const parsed = tryParseDynamicFloatList(dynamicRaw)
            if (parsed) setValue(arg.name, parsed.map((v, i) => snapQuantity(units.fromDisplay(catAt(i), v))))
            setDynamicOverride(null)
          }}
          placeholder="e.g. 1, 2, 3"
          disabled={disabled}
        />
      </div>
    )
  }

  const fixed = arr.length ? arr : Array.from({ length: len }, () => 0)
  const syms = Array.from({ length: len }, (_, i) => symAt(i))
  const uniform = new Set(syms).size === 1 ? syms[0] : ''

  return (
    <div className="grid gap-1.5">
      <FieldLabel text={label} description={arg.description} unit={uniform || undefined} />
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.min(len, 6)}, minmax(0,1fr))` }}
        onBlur={(e) => {
          if (arg.nodeSync && !e.currentTarget.contains(e.relatedTarget as Node)) {
            activeRef.current = false
            setActive(false)
            setNodePickMode('none')
          }
        }}
      >
        {Array.from({ length: len }, (_, idx) => (
          <NumberInput
            key={`${arg.name}-${idx}`}
            value={fixed[idx]}
            kind="float"
            cat={catAt(idx)}
            units={units}
            suffix={false}
            onCommit={(value) => {
              const next = [...fixed]
              next[idx] = value
              setValue(arg.name, next)
            }}
            onFocus={() => {
              if (arg.nodeSync) {
                activeRef.current = true
                setActive(true)
                setNextSlot(idx)
                setNodePickMode('vec-sequential')
              }
            }}
            disabled={disabled}
          />
        ))}
      </div>
      {!uniform && syms.some(Boolean) && (
        <div className="grid gap-1 -mt-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(len, 6)}, minmax(0,1fr))` }}>
          {syms.map((sym, i) => <span key={i} className="text-[10px] text-muted-foreground text-center truncate">{sym}</span>)}
        </div>
      )}
      {arg.nodeSync && active && (
        <p className="text-[10px] text-muted-foreground">
          Click nodes in viewport to fill sequentially
        </p>
      )}
    </div>
  )
}

// ─── main field dispatcher ────────────────────────────────────────────────────

export function SchemaFormField({ arg, values, setValue, ctx, disabled }: SchemaFormFieldProps) {
  const units = useUnits()
  if (arg.kind === 'idlist') {
    return <IdListField arg={arg} values={values} setValue={setValue} disabled={disabled} />
  }
  if (arg.kind === 'int' || arg.kind === 'float' || arg.kind === 'str') {
    if (arg.kind === 'str' && arg.name === 'literal') return null
    const key = arg.name
    const label = arg.label ?? arg.name

    return (
      <div className="grid gap-1.5">
        <FieldLabel text={label} description={arg.description} />
        {arg.kind === 'str' ? (
          <Input type="text" value={String(values[key] ?? '')} onChange={(e) => setValue(key, e.target.value)} disabled={disabled} />
        ) : (
          <NumberInput
            value={values[key]} kind={arg.kind} onCommit={(value) => setValue(key, value)} disabled={disabled} units={units}
            cat={arg.kind === 'float' ? resolveQty(arg.qty, { ndm: ctx.ndm, usage: values[USAGE_KEY] as MaterialUsage | undefined, dof: Number(values.dof) }) : null}
          />
        )}
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
          <span>{arg.label ?? arg.flag}</span>
          {arg.description && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button type="button" className="text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={`${arg.label ?? arg.flag} info`}>
                    <CircleHelp className="size-3" />
                  </button>
                }
              />
              <TooltipContent side="top">{arg.description}</TooltipContent>
            </Tooltip>
          )}
        </label>
        {enabled && arg.args.map((child, idx) => (
          <SchemaFormField key={`flag-${arg.flag}-${child.kind === 'flag' ? child.flag : child.name}-${idx}`} arg={child} values={values} setValue={setValue} ctx={ctx} disabled={disabled} />
        ))}
      </div>
    )
  }
  if (arg.kind === 'choice') {
    const key = arg.name
    const selected = String(values[key] ?? arg.options[0] ?? '')
    return (
      <div className="grid gap-1.5">
        <FieldLabel text={arg.label ?? arg.name} description={arg.description} />
        <Select value={selected} onValueChange={(value) => {
          setValue(key, value)
          for (const child of arg.yields[value ?? ''] ?? []) seedDefaults(child, values, setValue, ctx)
        }} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {arg.options.map((option: string) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
        {(arg.yields[selected] ?? []).length > 0 && (
          <div className="grid gap-2 rounded border p-2">
            {(arg.yields[selected] ?? []).map((child: ArgDef, idx: number) => (
              <SchemaFormField key={`choice-${key}-${selected}-${child.kind === 'flag' ? child.flag : child.name}-${idx}`} arg={child} values={values} setValue={setValue} ctx={ctx} disabled={disabled} />
            ))}
          </div>
        )}
      </div>
    )
  }
  return null
}
