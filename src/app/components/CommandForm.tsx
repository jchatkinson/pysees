import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/app/components/ui/combobox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/app/components/ui/alert-dialog'
import { useAppStore } from '@/app/store/useAppStore'
import {
  commandPreviewLine, fnForModelEntity, getAvailableSchemas, getCommandDocUrl, getPatternChildSchemas,
  getSchemaForFn, getSectionChildSchemas, initialValues, modelEntityToValues, validateSchemaResult,
} from '@/app/lib/commandSchemas'
import type { CommandSchema, SchemaResult } from '@/app/lib/commandSchemas'
import type { SchemaContext } from '@/app/types/schema'
import { SchemaFormField } from '@/app/components/SchemaFormField'
import type { Model } from '@/app/types/model'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import { ANALYSIS_BLOCKS, blockAsSchema } from '@/app/lib/analysisBlocks'
import { useHotkeyRegistry } from '@/app/lib/hotkeys'
import { CircleHelp } from 'lucide-react'

function getModelEntity(model: Model, kind: string, id: number): unknown {
  switch (kind) {
    case 'node': return model.nodes.get(id)
    case 'mass': return model.masses.get(id)
    case 'material': return model.materials.get(id)
    case 'section': return model.sections.get(id)
    case 'geomTransf': return model.geomTransfs.get(id)
    case 'beamIntegration': return model.beamIntegrations.get(id)
    case 'element': return model.elements.get(id)
    case 'fix': return model.fixes.get(id)
    case 'mpConstraint': return model.mpConstraints.get(id)
    case 'region': return model.regions.get(id)
    case 'timeSeries': return model.timeSeries.get(id)
    case 'pattern': return model.patterns.get(id)
    case 'misc': return model.misc.get(id)
    default: return undefined
  }
}

function matchesSchema(schema: CommandSchema, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${schema.label} ${schema.fn} ${schema.cmd}`.toLowerCase().includes(q)
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

/** Small nested-children editor shared by Fiber Sections and Load Patterns. */
function ChildrenEditor({
  ctx,
  locked,
  childSchemas,
  children,
  childLabel,
  onAdd,
  onRemove,
}: {
  ctx: SchemaContext
  locked: boolean
  childSchemas: CommandSchema[]
  children: { summary: string }[]
  childLabel: string
  onAdd: (schema: CommandSchema, values: Record<string, unknown>) => string | null
  onRemove: (index: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [selectedCmd, setSelectedCmd] = useState<string>(childSchemas[0]?.cmd ?? '')
  const schema = childSchemas.find((s) => s.cmd === selectedCmd) ?? null

  return (
    <div className="border-t p-3 grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{childLabel} ({children.length})</span>
        {!adding && (
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setAdding(true)} disabled={locked}>
            + Add
          </Button>
        )}
      </div>
      {children.map((c, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-[10px] font-mono">
          <span className="truncate">{c.summary}</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <button className="text-destructive shrink-0" onClick={() => onRemove(i)} disabled={locked} aria-label="Remove">×</button>
              }
            />
            <TooltipContent>Remove</TooltipContent>
          </Tooltip>
        </div>
      ))}
      {adding && schema && (
        <div className="rounded border">
          <div className="p-2 border-b">
            <select
              className="w-full text-xs bg-transparent"
              value={selectedCmd}
              onChange={(e) => setSelectedCmd(e.target.value)}
            >
              {childSchemas.map((s) => <option key={s.cmd} value={s.cmd}>{s.label}</option>)}
            </select>
          </div>
          <CommandFormBody
            key={selectedCmd}
            schema={schema}
            ctx={ctx}
            locked={locked}
            actionLabel="Add"
            initial={initialValues(schema, ctx)}
            onCancel={() => setAdding(false)}
            submitValues={(values) => {
              const err = onAdd(schema, values)
              if (!err) setAdding(false)
              return err
            }}
          />
        </div>
      )}
    </div>
  )
}

export function CommandForm() {
  const mode = useAppStore((s) => s.mode)
  const activePanel = useAppStore((s) => s.activePanel)
  const model = useAppStore((s) => s.model)
  const analysisHistory = useAppStore((s) => s.analysisHistory)
  const selectedModelEntity = useAppStore((s) => s.selectedModelEntity)
  const setSelectedModelEntity = useAppStore((s) => s.setSelectedModelEntity)
  const selectedAnalysisIndex = useAppStore((s) => s.selectedAnalysisIndex)
  const setSelectedAnalysisIndex = useAppStore((s) => s.setSelectedAnalysisIndex)
  const analysisInsertionIndex = useAppStore((s) => s.analysisInsertionIndex)
  const writeModelEntity = useAppStore((s) => s.writeModelEntity)
  const previewDeleteModelEntity = useAppStore((s) => s.previewDeleteModelEntity)
  const deleteModelEntity = useAppStore((s) => s.deleteModelEntity)
  const removeModelEntityChild = useAppStore((s) => s.removeModelEntityChild)
  const insertAnalysisCommandAt = useAppStore((s) => s.insertAnalysisCommandAt)
  const updateAnalysisCommandAt = useAppStore((s) => s.updateAnalysisCommandAt)
  const deleteAnalysisCommandAt = useAppStore((s) => s.deleteAnalysisCommandAt)
  const setMaterialPreviewInputMaterial = useAppStore((s) => s.setMaterialPreviewInputMaterial)
  const setMaterialPreviewPanelOpen = useAppStore((s) => s.setMaterialPreviewPanelOpen)

  const ctx = useMemo<SchemaContext>(() => ({ ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }), [model.config?.ndm, model.config?.ndf])
  const locked = mode === 'results'

  const [query, setQuery] = useState('')
  const [selectedCmd, setSelectedCmd] = useState<string>('')
  const [activeFormValues, setActiveFormValues] = useState<Record<string, unknown>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingModelDelete, setPendingModelDelete] = useState<{ kind: string; id: number } | null>(null)
  const [pendingAnalysisDeleteIndex, setPendingAnalysisDeleteIndex] = useState<number | null>(null)

  const isModelPanel = activePanel === 'model'
  const selectedAnalysisCommand: AnalysisCommand | null = selectedAnalysisIndex !== null ? analysisHistory.commands[selectedAnalysisIndex] ?? null : null

  // ── Add-mode schema list ──────────────────────────────────────────────────
  const addSchemas = useMemo(() => {
    const base = getAvailableSchemas(ctx.ndm).filter((s) => !s.childOnly)
    if (isModelPanel) return base.filter((s) => s.domain === 'model')
    const blockSchemas = ANALYSIS_BLOCKS.map(blockAsSchema)
    return [...base.filter((s) => s.domain !== 'model'), ...blockSchemas]
  }, [ctx.ndm, isModelPanel])

  const filteredSchemas = useMemo(() => addSchemas.filter((s) => matchesSchema(s, query)), [addSchemas, query])
  const selectedAddSchema = filteredSchemas.find((s) => s.cmd === selectedCmd) ?? null

  useHotkeyRegistry([
    {
      id: 'form.escape',
      description: 'Cancel selection or close delete dialog',
      key: 'Escape',
      action: () => {
        if (deleteDialogOpen) { setDeleteDialogOpen(false); setPendingModelDelete(null); setPendingAnalysisDeleteIndex(null); return }
        setSelectedModelEntity(null)
        setSelectedAnalysisIndex(null)
      },
    },
  ])

  if (!model.config) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">Command</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Create a model to add commands.</p>
        </div>
      </div>
    )
  }

  // ── MODEL PANEL: editing an existing entity ───────────────────────────────
  if (isModelPanel && selectedModelEntity) {
    const entity = getModelEntity(model, selectedModelEntity.kind, selectedModelEntity.id)
    const fn = entity ? fnForModelEntity(selectedModelEntity.kind as never, entity) : null
    const schema = fn ? getSchemaForFn(fn, ctx.ndm) : null
    if (!entity || !schema) {
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="border-t p-3 grid gap-2">
            <p className="text-[11px] text-muted-foreground">This entity type is not editable yet.</p>
            <Button variant="destructive" size="sm" onClick={() => { setPendingModelDelete(selectedModelEntity); setDeleteDialogOpen(true) }} disabled={locked}>Delete</Button>
          </div>
        </div>
      )
    }
    const initial = modelEntityToValues(selectedModelEntity.kind as never, entity, ctx)
    const isFiberSection = selectedModelEntity.kind === 'section' && ((entity as { secType: string }).secType === 'Fiber' || (entity as { secType: string }).secType === 'NDFiber')
    const isPattern = selectedModelEntity.kind === 'pattern'
    const previewLine = commandPreviewLine(schema, initial, ctx, model.nextIds.material)

    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="border-b px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Edit {schema.label} #{selectedModelEntity.id}</span>
            <a href={getCommandDocUrl(schema.fn, initial)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              <CircleHelp className="size-3.5" />
            </a>
          </div>
          <code className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1 text-[11px] font-mono text-foreground/80">{previewLine}</code>
        </div>
        <CommandFormBody
          key={`model-edit-${selectedModelEntity.kind}-${selectedModelEntity.id}`}
          schema={schema}
          ctx={ctx}
          locked={locked}
          actionLabel="Save"
          initial={initial}
          onCancel={() => setSelectedModelEntity(null)}
          onDelete={() => { setPendingModelDelete(selectedModelEntity); setDeleteDialogOpen(true) }}
          onValuesChange={(values) => {
            setActiveFormValues(values)
            if (schema.fn === 'uniaxialMaterial') setMaterialPreviewInputMaterial({ matType: String(values.matType ?? ''), values })
          }}
          previewAction={schema.fn === 'uniaxialMaterial' ? { onClick: () => setMaterialPreviewPanelOpen(true) } : undefined}
          submitValues={(values) => {
            const result: SchemaResult = schema.create(values, model, selectedModelEntity.id)
            if (result.target !== 'model') return 'Internal error: expected a model write.'
            const err = validateSchemaResult(result, model, ctx)
            if (err) return err
            writeModelEntity(result.write)
            return null
          }}
        />
        {isFiberSection && (
          <ChildrenEditor
            ctx={ctx}
            locked={locked}
            childSchemas={getSectionChildSchemas()}
            childLabel="Fibers"
            children={(entity as { children: { kind: string; args: Record<string, unknown> }[] }).children.map((c) => ({ summary: `${c.kind}  ${JSON.stringify(c.args)}` }))}
            onAdd={(childSchema, values) => {
              const result = childSchema.create({ ...values, sectionId: selectedModelEntity.id }, model)
              if (result.target !== 'model') return 'Internal error.'
              writeModelEntity(result.write)
              return null
            }}
            onRemove={(index) => removeModelEntityChild('section', selectedModelEntity.id, index)}
          />
        )}
        {isPattern && (
          <ChildrenEditor
            ctx={ctx}
            locked={locked}
            childSchemas={getPatternChildSchemas()}
            childLabel="Loads"
            children={(entity as { children: { kind: string; args: Record<string, unknown> }[] }).children.map((c) => ({ summary: `${c.kind}  ${JSON.stringify(c.args)}` }))}
            onAdd={(childSchema, values) => {
              const result = childSchema.create({ ...values, patternId: selectedModelEntity.id }, model)
              if (result.target !== 'model') return 'Internal error.'
              writeModelEntity(result.write)
              return null
            }}
            onRemove={(index) => removeModelEntityChild('pattern', selectedModelEntity.id, index)}
          />
        )}
        <DeleteDialogs
          deleteDialogOpen={deleteDialogOpen}
          setDeleteDialogOpen={setDeleteDialogOpen}
          pendingModelDelete={pendingModelDelete}
          setPendingModelDelete={setPendingModelDelete}
          pendingAnalysisDeleteIndex={pendingAnalysisDeleteIndex}
          setPendingAnalysisDeleteIndex={setPendingAnalysisDeleteIndex}
          previewDeleteModelEntity={previewDeleteModelEntity}
          deleteModelEntity={deleteModelEntity}
          deleteAnalysisCommandAt={deleteAnalysisCommandAt}
          onModelDeleted={() => setSelectedModelEntity(null)}
          onAnalysisDeleted={() => setSelectedAnalysisIndex(null)}
        />
      </div>
    )
  }

  // ── ANALYSIS PANEL: editing an existing command ───────────────────────────
  if (!isModelPanel && selectedAnalysisCommand) {
    if (selectedAnalysisCommand.type === 'SCRIPT_GROUP') {
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="border-t p-3 grid gap-2">
            <p className="text-[11px] text-muted-foreground">Script groups are not editable — delete and re-add instead.</p>
            <Button variant="destructive" size="sm" onClick={() => { setPendingAnalysisDeleteIndex(selectedAnalysisIndex); setDeleteDialogOpen(true) }} disabled={locked}>Delete</Button>
          </div>
          <DeleteDialogs
            deleteDialogOpen={deleteDialogOpen} setDeleteDialogOpen={setDeleteDialogOpen}
            pendingModelDelete={pendingModelDelete} setPendingModelDelete={setPendingModelDelete}
            pendingAnalysisDeleteIndex={pendingAnalysisDeleteIndex} setPendingAnalysisDeleteIndex={setPendingAnalysisDeleteIndex}
            previewDeleteModelEntity={previewDeleteModelEntity} deleteModelEntity={deleteModelEntity}
            deleteAnalysisCommandAt={deleteAnalysisCommandAt}
            onModelDeleted={() => setSelectedModelEntity(null)} onAnalysisDeleted={() => setSelectedAnalysisIndex(null)}
          />
        </div>
      )
    }
    const schema: CommandSchema | null = selectedAnalysisCommand.type === 'ANALYSIS_BLOCK'
      ? blockAsSchema(ANALYSIS_BLOCKS.find((b) => b.id === selectedAnalysisCommand.blockId)!)
      : getSchemaForFn(selectedAnalysisCommand.fn, ctx.ndm)
    if (!schema) {
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="border-t p-3 grid gap-2">
            <p className="text-[11px] text-muted-foreground">This command type is not editable yet.</p>
            <Button variant="destructive" size="sm" onClick={() => { setPendingAnalysisDeleteIndex(selectedAnalysisIndex); setDeleteDialogOpen(true) }} disabled={locked}>Delete</Button>
          </div>
        </div>
      )
    }
    const initial = selectedAnalysisCommand.type === 'ANALYSIS_BLOCK' ? selectedAnalysisCommand.params : selectedAnalysisCommand.values
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <div className="border-b px-3 py-2 shrink-0">
          <span className="text-xs font-medium text-muted-foreground">Edit Command #{selectedAnalysisIndex! + 1}: {schema.label}</span>
        </div>
        <CommandFormBody
          key={`analysis-edit-${selectedAnalysisIndex}-${schema.cmd}`}
          schema={schema}
          ctx={ctx}
          locked={locked}
          actionLabel="Save"
          initial={initial}
          onCancel={() => setSelectedAnalysisIndex(null)}
          onDelete={() => { setPendingAnalysisDeleteIndex(selectedAnalysisIndex); setDeleteDialogOpen(true) }}
          submitValues={(values) => {
            const result = schema.create(values, model)
            if (result.target !== 'analysis') return 'Internal error: expected an analysis command.'
            updateAnalysisCommandAt(selectedAnalysisIndex!, result.command)
            setSelectedAnalysisIndex(null)
            return null
          }}
        />
        <DeleteDialogs
          deleteDialogOpen={deleteDialogOpen} setDeleteDialogOpen={setDeleteDialogOpen}
          pendingModelDelete={pendingModelDelete} setPendingModelDelete={setPendingModelDelete}
          pendingAnalysisDeleteIndex={pendingAnalysisDeleteIndex} setPendingAnalysisDeleteIndex={setPendingAnalysisDeleteIndex}
          previewDeleteModelEntity={previewDeleteModelEntity} deleteModelEntity={deleteModelEntity}
          deleteAnalysisCommandAt={deleteAnalysisCommandAt}
          onModelDeleted={() => setSelectedModelEntity(null)} onAnalysisDeleted={() => setSelectedAnalysisIndex(null)}
        />
      </div>
    )
  }

  // ── ADD MODE ───────────────────────────────────────────────────────────────
  const previewLine = selectedAddSchema ? commandPreviewLine(selectedAddSchema, Object.keys(activeFormValues).length ? activeFormValues : initialValues(selectedAddSchema, ctx, model), ctx, model.nextIds.material) : null

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="border-b p-3 grid gap-2">
        <Combobox
          items={filteredSchemas}
          filter={null}
          inputValue={query}
          onInputValueChange={setQuery}
          itemToStringLabel={(schema: CommandSchema) => schema.label}
          isItemEqualToValue={(a: CommandSchema, b: CommandSchema) => a.cmd === b.cmd}
          value={selectedAddSchema}
          onValueChange={(schema) => { if (schema) { setSelectedCmd(schema.cmd); setActiveFormValues({}) } }}
          disabled={locked}
        >
          <ComboboxInput placeholder={isModelPanel ? 'Search model commands' : 'Search analysis commands / blocks'} className="h-8 text-xs" showClear />
          <ComboboxContent>
            <ComboboxEmpty>No matching commands.</ComboboxEmpty>
            <ComboboxList>
              {(schema: CommandSchema) => (
                <ComboboxItem key={schema.cmd} value={schema} className="items-start py-1">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">{schema.label}</span>
                    {schema.description && <span className="truncate text-[10px] text-muted-foreground">{schema.description}</span>}
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <div className="text-[11px] text-muted-foreground">
          {filteredSchemas.length} {isModelPanel ? 'model' : 'analysis'} command{filteredSchemas.length === 1 ? '' : 's'}
        </div>
      </div>
      {selectedAddSchema && (
        <div className="border-b px-3 py-2 shrink-0">
          <span className="text-xs font-medium text-muted-foreground">{selectedAddSchema.label}</span>
          {previewLine && <code className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1 text-[11px] font-mono text-foreground/80">{previewLine}</code>}
        </div>
      )}
      {selectedAddSchema ? (
        <CommandFormBody
          key={`add-${selectedAddSchema.cmd}-${ctx.ndm}-${ctx.ndf}`}
          schema={selectedAddSchema}
          ctx={ctx}
          locked={locked}
          actionLabel="Add Command"
          initial={initialValues(selectedAddSchema, ctx, model)}
          onValuesChange={(values) => {
            setActiveFormValues(values)
            if (selectedAddSchema.fn === 'uniaxialMaterial') setMaterialPreviewInputMaterial({ matType: String(values.matType ?? ''), values })
          }}
          previewAction={selectedAddSchema.fn === 'uniaxialMaterial' ? { onClick: () => setMaterialPreviewPanelOpen(true) } : undefined}
          submitValues={(values) => {
            const idListField = selectedAddSchema.args.find((a) => a.kind === 'idlist')
            if (idListField) {
              const ids = (values[idListField.name] as number[]) ?? []
              if (!ids.length) return 'Enter at least one node ID.'
              for (const id of ids) {
                const result = selectedAddSchema.create({ ...values, [idListField.name]: id }, model)
                if (result.target === 'model') {
                  const err = validateSchemaResult(result, model, ctx)
                  if (err) return err
                  writeModelEntity(result.write)
                } else {
                  insertAnalysisCommandAt(result.command, analysisInsertionIndex)
                }
              }
              return null
            }
            const result = selectedAddSchema.create(values, model)
            if (result.target === 'model') {
              const err = validateSchemaResult(result, model, ctx)
              if (err) return err
              writeModelEntity(result.write)
            } else {
              insertAnalysisCommandAt(result.command, analysisInsertionIndex)
            }
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
      <DeleteDialogs
        deleteDialogOpen={deleteDialogOpen} setDeleteDialogOpen={setDeleteDialogOpen}
        pendingModelDelete={pendingModelDelete} setPendingModelDelete={setPendingModelDelete}
        pendingAnalysisDeleteIndex={pendingAnalysisDeleteIndex} setPendingAnalysisDeleteIndex={setPendingAnalysisDeleteIndex}
        previewDeleteModelEntity={previewDeleteModelEntity} deleteModelEntity={deleteModelEntity}
        deleteAnalysisCommandAt={deleteAnalysisCommandAt}
        onModelDeleted={() => setSelectedModelEntity(null)} onAnalysisDeleted={() => setSelectedAnalysisIndex(null)}
      />
    </div>
  )
}

function DeleteDialogs({
  deleteDialogOpen, setDeleteDialogOpen,
  pendingModelDelete, setPendingModelDelete,
  pendingAnalysisDeleteIndex, setPendingAnalysisDeleteIndex,
  previewDeleteModelEntity, deleteModelEntity, deleteAnalysisCommandAt,
  onModelDeleted, onAnalysisDeleted,
}: {
  deleteDialogOpen: boolean
  setDeleteDialogOpen: (v: boolean) => void
  pendingModelDelete: { kind: string; id: number } | null
  setPendingModelDelete: (v: { kind: string; id: number } | null) => void
  pendingAnalysisDeleteIndex: number | null
  setPendingAnalysisDeleteIndex: (v: number | null) => void
  previewDeleteModelEntity: (kind: never, id: number) => string[]
  deleteModelEntity: (kind: never, id: number) => void
  deleteAnalysisCommandAt: (index: number) => void
  onModelDeleted: () => void
  onAnalysisDeleted: () => void
}) {
  const dependents = pendingModelDelete ? previewDeleteModelEntity(pendingModelDelete.kind as never, pendingModelDelete.id) : []
  return (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader className="items-start text-left">
          <AlertDialogTitle>Delete{dependents.length ? ' and dependencies' : ''}?</AlertDialogTitle>
          <AlertDialogDescription>
            {dependents.length > 0
              ? `This will also delete ${dependents.length} dependent command${dependents.length === 1 ? '' : 's'}: ${dependents.join(', ')}`
              : 'This action cannot be undone from here (use panel Undo).'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setPendingModelDelete(null); setPendingAnalysisDeleteIndex(null) }}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (pendingModelDelete) {
                deleteModelEntity(pendingModelDelete.kind as never, pendingModelDelete.id)
                onModelDeleted()
              }
              if (pendingAnalysisDeleteIndex !== null) {
                deleteAnalysisCommandAt(pendingAnalysisDeleteIndex)
                onAnalysisDeleted()
              }
              setPendingModelDelete(null)
              setPendingAnalysisDeleteIndex(null)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
