import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/app/components/ui/combobox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/app/components/ui/alert-dialog'
import { useAppStore, useModelState } from '@/app/store/useAppStore'
import { commandPreviewLine, commandToValues, getAvailableSchemas, getCommandDocUrl, getSchemaForCommand, initialValues, validateCommand } from '@/app/lib/commandSchemas'
import type { CommandSchema } from '@/app/lib/commandSchemas'
import type { SchemaContext } from '@/app/types/schema'
import { SchemaFormField } from '@/app/components/SchemaFormField'
import { replay } from '@/app/lib/replay'
import type { Command } from '@/app/types/commands'
import { useHotkeyRegistry } from '@/app/lib/hotkeys'
import { CircleHelp } from 'lucide-react'

function keyOf(schema: CommandSchema) {
  return schema.cmd
}

type CommandGroup = 'all' | 'model' | 'analysis' | 'output' | 'misc'

function schemaGroup(schema: CommandSchema): CommandGroup {
  if (schema.category === 'recorder' || schema.fn.toLowerCase().includes('recorder')) return 'output'
  if (new Set(['analyze', 'analysis', 'algorithm', 'integrator', 'constraints', 'numberer', 'system', 'test', 'eigen', 'rayleigh', 'loadConst', 'modalDamping']).has(schema.fn)) return 'analysis'
  if (new Set(['wipe', 'wipeAnalysis', 'version', 'logFile', 'printModel', 'remove']).has(schema.fn)) return 'misc'
  return 'model'
}

function matchesSchema(schema: CommandSchema, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${schema.label} ${schema.fn} ${schema.cmd}`.toLowerCase().includes(q)
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
  onValuesChange,
  previewAction,
}: {
  schema: CommandSchema
  ctx: SchemaContext
  locked: boolean
  actionLabel: string
  initial: Record<string, unknown>
  submitValues: (values: Record<string, unknown>) => string | null
  onCancel?: () => void
  onDelete?: () => void
  onValuesChange?: (values: Record<string, unknown>) => void
  previewAction?: { onClick: () => void; disabled?: boolean }
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initial)
  const [error, setError] = useState<string | null>(null)
  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    onValuesChange?.(values)
  // Parent recreates callback inline; avoid replaying on unchanged values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])

  return (
    <>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 grid gap-3">
          {schema.args.map((arg, idx) => (
            <SchemaFormField
              key={`arg-${arg.kind === 'flag' ? arg.flag : arg.name}-${idx}`}
              arg={arg}
              values={values}
              setValue={setValue}
              ctx={ctx}
              disabled={locked}
            />
          ))}
          {schema.optional.map((arg, idx) => (
            <SchemaFormField
              key={`opt-${arg.kind === 'flag' ? arg.flag : arg.name}-${idx}`}
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
          {previewAction && (
            <Button variant="outline" size="sm" className="flex-1" onClick={previewAction.onClick} disabled={locked || previewAction.disabled}>
              Preview
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
  const setSelectedNodeIds = useAppStore((s) => s.setSelectedNodeIds)
  const setMaterialPreviewInputCommand = useAppStore((s) => s.setMaterialPreviewInputCommand)
  const setMaterialPreviewPanelOpen = useAppStore((s) => s.setMaterialPreviewPanelOpen)
  const insertionIndex = useAppStore((s) => s.insertionIndex)
  const selectedHistoryIndex = useAppStore((s) => s.selectedHistoryIndex)
  const history = useAppStore((s) => s.history)
  const model = useModelState()
  const ctx = useMemo<SchemaContext>(() => ({ ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }), [model.config?.ndm, model.config?.ndf])
  const selectedCommand = selectedHistoryIndex !== null ? history.commands[selectedHistoryIndex] : null
  const editSchema = selectedCommand ? getSchemaForCommand(selectedCommand, ctx.ndm) : null
  const hasSelection = selectedHistoryIndex !== null
  const isEditing = selectedHistoryIndex !== null && Boolean(editSchema)
  const editModel = useMemo(() => {
    if (selectedHistoryIndex === null) return model
    return replay({ commands: history.commands, cursor: Math.max(history.cursor, selectedHistoryIndex) })
  }, [history.commands, history.cursor, model, selectedHistoryIndex])

  const schemas = useMemo(() => getAvailableSchemas(ctx.ndm), [ctx.ndm])
  const [selectedCmd, setSelectedCmd] = useState<string>('')
  const [selectedGroup, setSelectedGroup] = useState<CommandGroup>('all')
  const [query, setQuery] = useState('')
  const [activeFormValues, setActiveFormValues] = useState<Record<string, unknown>>({})
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const filteredSchemas = useMemo(() => {
    const searching = query.trim().length > 0
    return schemas.filter((schema) => {
      if (!matchesSchema(schema, query)) return false
      return searching || selectedGroup === 'all' ? true : schemaGroup(schema) === selectedGroup
    })
  }, [schemas, query, selectedGroup])
  // No implicit fallback to the first match: switching groups or searching should
  // never silently swap the active command out from under the user.
  const selectedSchema = filteredSchemas.find((s) => s.cmd === selectedCmd) ?? null
  const selectGroup = (group: CommandGroup) => {
    setSelectedGroup(group)
    setSelectedCmd('')
    setQuery('')
  }
  const activeSchema = isEditing ? editSchema : selectedSchema
  const fallbackDocValues = useMemo(() => {
    if (Object.keys(activeFormValues).length > 0) return activeFormValues
    if (isEditing && selectedCommand) return commandToValues(selectedCommand, ctx)
    if (selectedSchema) return initialValues(selectedSchema, ctx, model)
    return {}
  }, [activeFormValues, ctx, isEditing, model, selectedCommand, selectedSchema])
  const activeDocsUrl = activeSchema ? getCommandDocUrl(activeSchema.fn, fallbackDocValues) : null
  const previewLine = activeSchema ? commandPreviewLine(activeSchema, fallbackDocValues, ctx, model.nextMatId) : null
  const locked = mode === 'results'
  const pendingDeleteIndices = pendingDeleteIndex === null ? [] : previewDeleteCascade(pendingDeleteIndex)
  const isUniaxial = (cmd: Command) => cmd.type === 'ADD_OPS' && cmd.fn === 'uniaxialMaterial'

  const requestDelete = (index: number) => {
    setPendingDeleteIndex(index)
    setDeleteDialogOpen(true)
  }

  const [prevSelectionKey, setPrevSelectionKey] = useState('')
  const currentSelectionKey = `${selectedHistoryIndex}-${selectedSchema?.cmd}`
  if (currentSelectionKey !== prevSelectionKey) {
    setPrevSelectionKey(currentSelectionKey)
    setActiveFormValues({})
  }

  useEffect(() => {
    if (isEditing && editSchema && selectedCommand) return
    if (!selectedSchema) setMaterialPreviewInputCommand(null)
  }, [isEditing, editSchema, selectedCommand, selectedSchema, setMaterialPreviewInputCommand])

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
        setSelectedNodeIds([])
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

  if (!selectedSchema && schemas.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">Command</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Create a model to add commands.</p>
        </div>
      </div>
    )
  }

  const commandPreviewBlock = activeSchema && (
    <div className="border-b px-3 py-2 shrink-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{hasSelection ? `Edit Command #${selectedHistoryIndex! + 1}: ${activeSchema.label}` : activeSchema.label}</span>
        {activeDocsUrl && (
          <a
            href={activeDocsUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={`Open ${activeSchema.fn} docs`}
            aria-label={`Open ${activeSchema.fn} docs`}
          >
            <CircleHelp className="size-3.5" />
          </a>
        )}
      </div>
      {previewLine && (
        <code className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1 text-[11px] font-mono text-foreground/80">
          {previewLine}
        </code>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {isEditing && editSchema && selectedCommand ? (
        <>
          {commandPreviewBlock}
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
            onValuesChange={(values) => {
              setActiveFormValues(values)
              const cmd = editSchema.create(values, editModel, selectedCommand)
              setMaterialPreviewInputCommand(isUniaxial(cmd) ? cmd : null)
            }}
            previewAction={isUniaxial(selectedCommand) ? { onClick: () => setMaterialPreviewPanelOpen(true) } : undefined}
          />
        </>
      ) : (
        <>
          <div className="border-b p-3 grid gap-2">
            <Combobox
              items={filteredSchemas}
              filter={null}
              inputValue={query}
              onInputValueChange={setQuery}
              itemToStringLabel={(schema: CommandSchema) => schema.label}
              isItemEqualToValue={(a: CommandSchema, b: CommandSchema) => a.cmd === b.cmd}
              value={selectedSchema}
              onValueChange={(schema) => {
                if (schema) setSelectedCmd(schema.cmd)
              }}
              disabled={locked}
            >
              <ComboboxInput placeholder="Search commands (e.g. uni)" className="h-8 text-xs" showClear />
              <ComboboxContent>
                <ComboboxEmpty>No matching commands.</ComboboxEmpty>
                <ComboboxList>
                  {(schema: CommandSchema) => (
                    <ComboboxItem key={keyOf(schema)} value={schema} className="items-start py-1.5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate">{schema.label}</span>
                        {schema.description && (
                          <span className="truncate text-[10px] text-muted-foreground">{schema.description}</span>
                        )}
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <div className="flex gap-1">
              {(['all', 'model', 'analysis', 'output', 'misc'] as CommandGroup[]).map((group) => (
                <Button key={group} variant={selectedGroup === group ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-[11px] capitalize" onClick={() => selectGroup(group)} disabled={locked}>
                  {group}
                </Button>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {query.trim()
                ? `${filteredSchemas.length} result${filteredSchemas.length === 1 ? '' : 's'} for "${query.trim()}"`
                : `${filteredSchemas.length} ${selectedGroup === 'all' ? '' : `${selectedGroup} `}command${filteredSchemas.length === 1 ? '' : 's'}`}
            </div>
          </div>
          {commandPreviewBlock}
          {selectedSchema ? (
            <CommandFormBody
              key={`add-${selectedSchema.cmd}-${ctx.ndm}-${ctx.ndf}`}
              schema={selectedSchema}
              ctx={ctx}
              locked={locked}
              actionLabel="Add Command"
              initial={initialValues(selectedSchema, ctx, model)}
              onValuesChange={(values) => {
                setActiveFormValues(values)
                const cmd = selectedSchema.create(values, model)
                setMaterialPreviewInputCommand(isUniaxial(cmd) ? cmd : null)
              }}
              previewAction={selectedSchema.fn === 'uniaxialMaterial' ? { onClick: () => setMaterialPreviewPanelOpen(true) } : undefined}
              submitValues={(values) => {
                // If the schema has an idlist field, create one command per ID
                const idListField = selectedSchema.args.find((a) => a.kind === 'idlist')
                if (idListField) {
                  const ids = (values[idListField.name] as number[]) ?? []
                  if (!ids.length) return 'Enter at least one node ID.'
                  let at = insertionIndex
                  for (const id of ids) {
                    const cmd = selectedSchema.create({ ...values, [idListField.name]: id }, model)
                    const err = validateCommand(cmd, model)
                    if (err) return err
                    insertCommandAt(cmd, at)
                    if (at !== null) at++
                  }
                  return null
                }
                const cmd = selectedSchema.create(values, model)
                const validation = validateCommand(cmd, model)
                if (validation) return validation
                insertCommandAt(cmd, insertionIndex)
                return null
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xs text-muted-foreground text-center">
                {filteredSchemas.length === 0 ? 'No commands match your search.' : 'Search or pick a command above to add it.'}
              </p>
            </div>
          )}
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
