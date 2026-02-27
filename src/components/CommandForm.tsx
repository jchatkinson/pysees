import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useAppStore, useModelState } from '@/store/useAppStore'
import { commandToValues, getAvailableSchemas, getSchemaForCommand, initialValues, validateCommand } from '@/lib/commandSchemas'
import type { CommandSchema } from '@/lib/commandSchemas'
import type { SchemaContext } from '@/types/schema'
import { SchemaFormField } from '@/components/SchemaFormField'
import { replay } from '@/lib/replay'
import type { Command } from '@/types/commands'
import { useHotkeyRegistry } from '@/lib/hotkeys'

function keyOf(schema: CommandSchema) {
  return schema.cmd
}

function commandSummary(cmd: Command): string {
  switch (cmd.type) {
    case 'MODEL_INIT': return `model ndm=${cmd.ndm} ndf=${cmd.ndf}`
    case 'ADD_NODE': return `node ${cmd.id} [${cmd.coords.join(', ')}]`
    case 'ADD_ELEMENT': return `${cmd.eleType} ${cmd.id}`
    case 'ADD_MATERIAL': return `material ${cmd.id} ${cmd.matType}`
    case 'FIX': return `fix node ${cmd.nodeId}`
    case 'ADD_LOAD': return `load node ${cmd.nodeId}`
    case 'ADD_RECORDER': return `recorder ${cmd.recorderType}`
    case 'ADD_OPS': return `${cmd.fn} (${Object.keys(cmd.values).length} args)`
    case 'SCRIPT_GROUP': return `script (${cmd.commands.length} cmds)`
  }
}

function CommandFormBody({
  schema,
  ctx,
  locked,
  actionLabel,
  initial,
  submitValues,
  onCancel,
  onDelete,
}: {
  schema: CommandSchema
  ctx: SchemaContext
  locked: boolean
  actionLabel: string
  initial: Record<string, unknown>
  submitValues: (values: Record<string, unknown>) => string | null
  onCancel?: () => void
  onDelete?: () => void
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
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={locked}>
              Delete
            </Button>
          )}
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
  const insertCommandAt = useAppStore((s) => s.insertCommandAt)
  const updateCommandAt = useAppStore((s) => s.updateCommandAt)
  const previewDeleteCascade = useAppStore((s) => s.previewDeleteCascade)
  const deleteCommandCascade = useAppStore((s) => s.deleteCommandCascade)
  const setSelectedHistoryIndex = useAppStore((s) => s.setSelectedHistoryIndex)
  const insertionIndex = useAppStore((s) => s.insertionIndex)
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
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const selectedSchema = schemas.find((s) => s.cmd === selectedCmd) ?? schemas[0] ?? null
  const locked = mode === 'results'
  const pendingDeleteIndices = pendingDeleteIndex === null ? [] : previewDeleteCascade(pendingDeleteIndex)

  const requestDelete = (index: number) => {
    setPendingDeleteIndex(index)
    setDeleteDialogOpen(true)
  }

  useHotkeyRegistry([
    {
      id: 'form.escape',
      description: 'Cancel selection or close delete dialog',
      key: 'Escape',
      action: () => {
        if (deleteDialogOpen) {
          setDeleteDialogOpen(false)
          setPendingDeleteIndex(null)
          return
        }
        setSelectedHistoryIndex(null)
      },
    },
    {
      id: 'form.delete',
      description: 'Delete selected command',
      key: 'Delete',
      when: () => selectedHistoryIndex !== null && !locked && !deleteDialogOpen,
      action: () => {
        if (selectedHistoryIndex !== null) requestDelete(selectedHistoryIndex)
      },
    },
    {
      id: 'form.backspace-delete',
      description: 'Delete selected command',
      key: 'Backspace',
      when: () => selectedHistoryIndex !== null && !locked && !deleteDialogOpen,
      action: () => {
        if (selectedHistoryIndex !== null) requestDelete(selectedHistoryIndex)
      },
    },
  ])

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
          onDelete={() => requestDelete(selectedHistoryIndex!)}
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
              insertCommandAt(cmd, insertionIndex)
              return null
            }}
          />
        </>
      )}
      {selectedHistoryIndex !== null && !editSchema && (
        <div className="border-t p-3 grid gap-2">
          <p className="text-[11px] text-muted-foreground">
            This command type is not editable yet.
          </p>
          <Button variant="destructive" size="sm" onClick={() => requestDelete(selectedHistoryIndex)} disabled={locked}>
            Delete
          </Button>
        </div>
      )}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader className="items-start text-left">
            <AlertDialogTitle>Delete command and dependencies?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {pendingDeleteIndices.length} command{pendingDeleteIndices.length === 1 ? '' : 's'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ScrollArea className="max-h-60 rounded border p-2">
            <div className="grid gap-1 text-xs font-mono">
              {pendingDeleteIndices.map((idx) => {
                const cmd = history.commands[idx]
                if (!cmd) return null
                return (
                  <div key={idx} className="rounded px-2 py-1 hover:bg-accent/50">
                    {idx + 1}. {commandSummary(cmd)}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteIndex(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteIndex !== null) deleteCommandCascade(pendingDeleteIndex)
                setPendingDeleteIndex(null)
              }}
            >
              Delete {pendingDeleteIndices.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
