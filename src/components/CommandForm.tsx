import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppStore, useModelState } from '@/store/useAppStore'
import { getAvailableSchemas, initialValues, validateCommand } from '@/lib/commandSchemas'
import type { CommandSchema } from '@/lib/commandSchemas'
import type { SchemaContext } from '@/types/schema'
import { SchemaFormField } from '@/components/SchemaFormField'

function keyOf(schema: CommandSchema) {
  return schema.cmd
}

function CommandFormBody({
  schema,
  ctx,
  locked,
  model,
  pushCommand,
}: {
  schema: CommandSchema
  ctx: SchemaContext
  locked: boolean
  model: ReturnType<typeof useModelState>
  pushCommand: ReturnType<typeof useAppStore>['pushCommand']
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(schema, ctx))
  const [error, setError] = useState<string | null>(null)
  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <>
      <ScrollArea className="flex-1">
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
          <Button variant="outline" size="sm" className="flex-1" onClick={() => { setValues(initialValues(schema, ctx)); setError(null) }} disabled={locked}>
            Reset
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={locked}
            onClick={() => {
              const cmd = schema.create(values, model)
              const validation = validateCommand(cmd, model)
              if (validation) return setError(validation)
              pushCommand(cmd)
              setError(null)
              setValues(initialValues(schema, ctx))
            }}
          >
            Add Command
          </Button>
        </div>
      </div>
    </>
  )
}

export function CommandForm() {
  const mode = useAppStore((s) => s.mode)
  const pushCommand = useAppStore((s) => s.pushCommand)
  const model = useModelState()
  const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
  const schemas = useMemo(() => getAvailableSchemas(ctx.ndm), [ctx.ndm])
  const [selectedCmd, setSelectedCmd] = useState<string>(schemas[0]?.cmd ?? '')
  const selectedSchema = schemas.find((s) => s.cmd === selectedCmd) ?? schemas[0] ?? null
  const locked = mode === 'results'

  if (!selectedSchema) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">Command</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Create a model to add commands.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">Command</div>
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
        key={`${selectedSchema.cmd}-${ctx.ndm}-${ctx.ndf}`}
        schema={selectedSchema}
        ctx={ctx}
        locked={locked}
        model={model}
        pushCommand={pushCommand}
      />
    </div>
  )
}
