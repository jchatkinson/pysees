import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppStore, useModelState } from '@/store/useAppStore'
import { commandToValues, getAvailableSchemas, getSchemaForCommand, initialValues, validateCommand } from '@/lib/commandSchemas'
import type { CommandSchema } from '@/lib/commandSchemas'
import type { SchemaContext } from '@/types/schema'
import { SchemaFormField } from '@/components/SchemaFormField'
import { replay } from '@/lib/replay'

function keyOf(schema: CommandSchema) {
  return schema.cmd
}

function CommandFormBody({
  schema,
  ctx,
  locked,
  actionLabel,
  initial,
  submitValues,
  onCancel,
}: {
  schema: CommandSchema
  ctx: SchemaContext
  locked: boolean
  actionLabel: string
  initial: Record<string, unknown>
  submitValues: (values: Record<string, unknown>) => string | null
  onCancel?: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initial)
  const [error, setError] = useState<string | null>(null)
  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 grid gap-3">
          {schema.args.map((arg) => (
            <SchemaFormField
              key={arg.kind === 'flag' ? arg.flag : arg.name}
              arg={arg}
              values={values}
              setValue={setValue}
              ctx={ctx}
              disabled={locked}
            />
          ))}
          {schema.optional.map((arg) => (
            <SchemaFormField
              key={arg.kind === 'flag' ? arg.flag : arg.name}
              arg={arg}
              values={values}
              setValue={setValue}
              ctx={ctx}
              disabled={locked}
            />
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-3 grid gap-2 shrink-0">
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        {locked && <p className="text-[11px] text-muted-foreground">Model is read-only in Results mode.</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => { setValues(initial); setError(null) }} disabled={locked}>
            Reset
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            className={onCancel ? '' : 'flex-1'}
            disabled={locked}
            onClick={() => {
              const validation = submitValues(values)
              setError(validation)
              if (!validation) setValues(initial)
            }}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </>
  )
}

export function CommandForm() {
  const mode = useAppStore((s) => s.mode)
  const pushCommand = useAppStore((s) => s.pushCommand)
  const updateCommandAt = useAppStore((s) => s.updateCommandAt)
  const setSelectedHistoryIndex = useAppStore((s) => s.setSelectedHistoryIndex)
  const selectedHistoryIndex = useAppStore((s) => s.selectedHistoryIndex)
  const history = useAppStore((s) => s.history)
  const model = useModelState()
  const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
  const selectedCommand = selectedHistoryIndex !== null ? history.commands[selectedHistoryIndex] : null
  const editSchema = selectedCommand ? getSchemaForCommand(selectedCommand, ctx.ndm) : null
  const hasSelection = selectedHistoryIndex !== null
  const isEditing = selectedHistoryIndex !== null && Boolean(editSchema)
  const editModel = useMemo(() => {
    if (selectedHistoryIndex === null) return model
    return replay({ commands: history.commands, cursor: Math.max(history.cursor, selectedHistoryIndex) })
  }, [history.commands, history.cursor, model, selectedHistoryIndex])

  const schemas = useMemo(() => getAvailableSchemas(ctx.ndm), [ctx.ndm])
  const [selectedCmd, setSelectedCmd] = useState<string>(schemas[0]?.cmd ?? '')
  const selectedSchema = schemas.find((s) => s.cmd === selectedCmd) ?? schemas[0] ?? null
  const locked = mode === 'results'

  if (!selectedSchema) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">Command</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Create a model to add commands.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">
        {hasSelection ? `Edit Command #${selectedHistoryIndex! + 1}` : 'Command'}
      </div>
      {isEditing && editSchema && selectedCommand ? (
        <CommandFormBody
          key={`edit-${selectedHistoryIndex}-${editSchema.cmd}-${ctx.ndm}-${ctx.ndf}`}
          schema={editSchema}
          ctx={ctx}
          locked={locked}
          actionLabel="Save"
          initial={commandToValues(selectedCommand, ctx)}
          submitValues={(values) => {
            const cmd = editSchema.create(values, editModel, selectedCommand)
            const validation = validateCommand(cmd, editModel)
            if (validation) return validation
            updateCommandAt(selectedHistoryIndex!, cmd)
            setSelectedHistoryIndex(null)
            return null
          }}
          onCancel={() => setSelectedHistoryIndex(null)}
        />
      ) : (
        <>
          <div className="border-b p-3 grid gap-2">
            <div className="text-[11px] text-muted-foreground">Command Type</div>
            <Select
              value={selectedSchema.cmd}
              onValueChange={(cmd) => {
                const schema = schemas.find((s) => s.cmd === cmd)
                if (!schema) return
                setSelectedCmd(schema.cmd)
              }}
              disabled={locked}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((schema) => <SelectItem key={keyOf(schema)} value={schema.cmd}>{schema.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <CommandFormBody
            key={`add-${selectedSchema.cmd}-${ctx.ndm}-${ctx.ndf}`}
            schema={selectedSchema}
            ctx={ctx}
            locked={locked}
            actionLabel="Add Command"
            initial={initialValues(selectedSchema, ctx)}
            submitValues={(values) => {
              const cmd = selectedSchema.create(values, model)
              const validation = validateCommand(cmd, model)
              if (validation) return validation
              pushCommand(cmd)
              return null
            }}
          />
        </>
      )}
      {selectedHistoryIndex !== null && !editSchema && (
        <div className="border-t p-3 text-[11px] text-muted-foreground">
          This command type is not editable yet. Supported: node, fix, load, element.
        </div>
      )}
    </div>
  )
}
