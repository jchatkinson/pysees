import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useAppStore, useModelState } from '@/store/useAppStore'
import { commandToValues, getAvailableSchemas, getSchemaForCommand, initialValues, validateCommand } from '@/lib/commandSchemas'
import type { CommandSchema } from '@/lib/commandSchemas'
import type { SchemaContext } from '@/types/schema'
import { SchemaFormField } from '@/components/SchemaFormField'
import { replay } from '@/lib/replay'
import type { Command } from '@/types/commands'
import { useHotkeyRegistry } from '@/lib/hotkeys'
import { X } from 'lucide-react'

function collectMaterialTags(cmd: Command, out: Set<number>) {
  if (cmd.type === 'ADD_MATERIAL') {
    out.add(cmd.id)
    return
  }
  if (cmd.type === 'ADD_OPS' && cmd.fn === 'uniaxialMaterial') {
    const tag = Number(cmd.values.matTag)
    if (Number.isFinite(tag) && tag > 0) out.add(Math.trunc(tag))
    return
  }
  if (cmd.type === 'SCRIPT_GROUP') for (const child of cmd.commands) collectMaterialTags(child, out)
}

function findMatTag(cmd: Command): number | null {
  if (cmd.type !== 'ADD_OPS' || cmd.fn !== 'uniaxialMaterial') return null
  const tag = Number(cmd.values.matTag)
  return Number.isFinite(tag) && tag > 0 ? Math.trunc(tag) : null
}

function MaterialPreviewPanel({ cmd, disabled }: { cmd: Command; disabled: boolean }) {
  const localAgent = useAppStore((s) => s.localAgent)
  const materialPreview = useAppStore((s) => s.materialPreview)
  const runMaterialPreview = useAppStore((s) => s.runMaterialPreview)
  const cancelMaterialPreview = useAppStore((s) => s.cancelMaterialPreview)

  const points = materialPreview.points
  const xs = points.map((p) => p.eps)
  const ys = points.map((p) => p.sig)
  const minX = xs.length ? Math.min(...xs) : -1
  const maxX = xs.length ? Math.max(...xs) : 1
  const minY = ys.length ? Math.min(...ys) : -1
  const maxY = ys.length ? Math.max(...ys) : 1
  const spanX = Math.max(1e-12, maxX - minX)
  const spanY = Math.max(1e-12, maxY - minY)
  const polyline = points
    .map((p) => `${((p.eps - minX) / spanX) * 100},${100 - ((p.sig - minY) / spanY) * 100}`)
    .join(' ')

  return (
    <div className="rounded border p-2 grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium">Local Material Preview</p>
        <p className="text-[10px] text-muted-foreground">
          {localAgent.status === 'connected' ? `Connected:${localAgent.port}` : localAgent.status}
        </p>
      </div>
      {materialPreview.error && <p className="text-[10px] text-destructive">{materialPreview.error}</p>}
      {localAgent.error && <p className="text-[10px] text-destructive">{localAgent.error}</p>}
      <svg viewBox="0 0 100 100" className="h-28 w-full rounded border bg-muted/20">
        <polyline fill="none" stroke="currentColor" strokeWidth="1.2" points={polyline} />
      </svg>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{points.length} points</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={disabled || localAgent.status !== 'connected' || materialPreview.running} onClick={() => runMaterialPreview(cmd)}>
            Run Local Preview
          </Button>
          <Button size="sm" variant="ghost" disabled={!materialPreview.running} onClick={cancelMaterialPreview}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function keyOf(schema: CommandSchema) {
  return schema.cmd
}

type CommandGroup = 'model' | 'analysis' | 'output' | 'misc'

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
  footerExtra,
}: {
  schema: CommandSchema
  ctx: SchemaContext
  locked: boolean
  actionLabel: string
  initial: Record<string, unknown>
  submitValues: (values: Record<string, unknown>) => string | null
  onCancel?: () => void
  onDelete?: () => void
  footerExtra?: (values: Record<string, unknown>) => ReactNode
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
        {footerExtra?.(values)}
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
  const setSelectedNodeIds = useAppStore((s) => s.setSelectedNodeIds)
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
  const [selectedCmd, setSelectedCmd] = useState<string>('')
  const [selectedGroup, setSelectedGroup] = useState<CommandGroup>('model')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const filteredSchemas = useMemo(() => {
    const searching = debouncedQuery.trim().length > 0
    return schemas.filter((schema) => {
      if (!matchesSchema(schema, debouncedQuery)) return false
      return searching ? true : schemaGroup(schema) === selectedGroup
    })
  }, [schemas, debouncedQuery, selectedGroup])
  const selectedSchema = filteredSchemas.find((s) => s.cmd === selectedCmd) ?? filteredSchemas[0] ?? null
  const locked = mode === 'results'
  const pendingDeleteIndices = pendingDeleteIndex === null ? [] : previewDeleteCascade(pendingDeleteIndex)
  const isUniaxial = (cmd: Command) => cmd.type === 'ADD_OPS' && cmd.fn === 'uniaxialMaterial'
  const existingMaterialTags = useMemo(() => {
    const tags = new Set<number>()
    for (let i = 0; i <= history.cursor; i += 1) {
      if (isEditing && i === selectedHistoryIndex) continue
      const cmd = history.commands[i]
      if (cmd) collectMaterialTags(cmd, tags)
    }
    return tags
  }, [history.commands, history.cursor, isEditing, selectedHistoryIndex])

  const requestDelete = (index: number) => {
    setPendingDeleteIndex(index)
    setDeleteDialogOpen(true)
  }

  useEffect(() => {
    if (selectedSchema && selectedSchema.cmd !== selectedCmd) setSelectedCmd(selectedSchema.cmd)
  }, [selectedSchema, selectedCmd])

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(id)
  }, [query])

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
          footerExtra={(values) => {
            const cmd = editSchema.create(values, editModel, selectedCommand)
            if (!isUniaxial(cmd)) return null
            const tag = findMatTag(cmd)
            const conflict = tag !== null && existingMaterialTags.has(tag)
            return (
              <div className="grid gap-2">
                {conflict && <p className="text-[10px] text-amber-600">Warning: material tag {tag} already exists.</p>}
                <MaterialPreviewPanel cmd={cmd} disabled={locked} />
              </div>
            )
          }}
        />
      ) : (
        <>
          <div className="border-b p-3 grid gap-2">
            <InputGroup className="h-8">
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands (e.g. uni)"
                disabled={locked}
                className="text-xs"
              />
              {query.trim().length > 0 && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('')
                      setDebouncedQuery('')
                    }}
                    disabled={locked}
                  >
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <div className="flex gap-1">
              {(['model', 'analysis', 'output', 'misc'] as CommandGroup[]).map((group) => (
                <Button key={group} variant={selectedGroup === group ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-[11px] capitalize" onClick={() => setSelectedGroup(group)} disabled={locked}>
                  {group}
                </Button>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {debouncedQuery.trim() ? `Showing ${filteredSchemas.length} search result${filteredSchemas.length === 1 ? '' : 's'} across all groups` : 'Command Type'}
            </div>
            <Select
              value={selectedSchema?.cmd ?? ''}
              onValueChange={(cmd) => {
                const schema = filteredSchemas.find((s) => s.cmd === cmd)
                if (!schema) return
                setSelectedCmd(schema.cmd)
              }}
              disabled={locked || !selectedSchema}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filteredSchemas.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No matching commands.</div>}
                {filteredSchemas.map((schema) => <SelectItem key={keyOf(schema)} value={schema.cmd}>{schema.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedSchema ? (
            <CommandFormBody
              key={`add-${selectedSchema.cmd}-${ctx.ndm}-${ctx.ndf}`}
              schema={selectedSchema}
              ctx={ctx}
              locked={locked}
              actionLabel="Add Command"
              initial={initialValues(selectedSchema, ctx, model)}
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
              footerExtra={(values) => {
                const cmd = selectedSchema.create(values, model)
                if (!isUniaxial(cmd)) return null
                const tag = findMatTag(cmd)
                const conflict = tag !== null && existingMaterialTags.has(tag)
                return (
                  <div className="grid gap-2">
                    {conflict && <p className="text-[10px] text-amber-600">Warning: material tag {tag} already exists.</p>}
                    <MaterialPreviewPanel cmd={cmd} disabled={locked} />
                  </div>
                )
              }}
            />
          ) : (
            <div className="p-3 text-xs text-muted-foreground">No commands match the current search.</div>
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
