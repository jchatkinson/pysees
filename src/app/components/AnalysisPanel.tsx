import { useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, Eye, EyeOff, Play, Loader2, CheckCircle2, XCircle, Square } from 'lucide-react'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Button } from '@/app/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { useAppStore } from '@/app/store/useAppStore'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import { domainForFn } from '@/app/lib/commandDomain'
import { getAnalysisBlock, resolveAnalysisCommand } from '@/app/lib/analysisBlocks'
import { queryResults } from '@/app/lib/resultsStorage/resultsStorageClient'

function cmdCategory(cmd: AnalysisCommand): string {
  if (cmd.type === 'ANALYSIS_BLOCK') return 'blocks'
  if (cmd.type === 'SCRIPT_GROUP') return 'script'
  return domainForFn(cmd.fn) === 'output' ? 'recorders' : 'solver'
}

const CATEGORY_LABELS: Record<string, string> = {
  solver: 'Solver',
  recorders: 'Recorders',
  blocks: 'Blocks',
  script: 'Script',
}

function summary(cmd: AnalysisCommand): string {
  if (cmd.type === 'ANALYSIS_BLOCK') {
    const block = getAnalysisBlock(cmd.blockId)
    return `[block] ${block?.label ?? cmd.blockId}`
  }
  if (cmd.type === 'SCRIPT_GROUP') return `script (${cmd.commands.length} cmds)`
  if (Array.isArray(cmd.values.__args)) {
    const args = cmd.values.__args as unknown[]
    return `${cmd.fn}(${args.join(', ')})`
  }
  return `${cmd.fn}  (${Object.keys(cmd.values).length} args)`
}

type DisplayGroup = { category: string; startIndex: number; endIndex: number; count: number }

function computeGroups(commands: AnalysisCommand[]): DisplayGroup[] {
  const groups: DisplayGroup[] = []
  let i = 0
  while (i < commands.length) {
    const cat = cmdCategory(commands[i])
    let j = i
    while (j < commands.length && cmdCategory(commands[j]) === cat) j++
    groups.push({ category: cat, startIndex: i, endIndex: j - 1, count: j - i })
    i = j
  }
  return groups
}

const AUTO_COLLAPSE_THRESHOLD = 4

// One sortable command row; the whole row is a drop target, so the thin divider gaps no longer matter.
function SortableRow({ id, children }: { id: number; children: (handle: React.HTMLAttributes<HTMLButtonElement>) => React.ReactNode }) {
  // Ids are positional and the store reorders on drop, so rows must not animate back to rest afterwards.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({ id, animateLayoutChanges: () => false })
  const style = { transform: CSS.Transform.toString(transform && { ...transform, x: 0, scaleX: 1, scaleY: 1 }), transition: isSorting ? transition : undefined }
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative z-10 bg-background shadow-md opacity-90' : ''}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

export function AnalysisPanel() {
  const {
    model,
    analysisHistory,
    selectedAnalysisIndex,
    setSelectedAnalysisIndex,
    analysisInsertionIndex,
    setAnalysisInsertionIndex,
    moveAnalysisCommand,
    toggleAnalysisCommandDisabled,
    carapaceRun,
    runCarapace,
    cancelCarapaceRun,
  } = useAppStore()

  const { commands, cursor } = analysisHistory
  const groups = useMemo(() => computeGroups(commands), [commands])

  const [overrides, setOverrides] = useState<Set<number>>(new Set())
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())
  const toggleBlock = (i: number) => setExpandedBlocks((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = Number(active.id), overIdx = Number(over.id)
    // Dropping on a row below the source lands after it; above lands before it.
    moveAnalysisCommand(from, overIdx > from ? overIdx + 1 : overIdx)
  }
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const busy = carapaceRun.status === 'compiling' || carapaceRun.status === 'running'

  // Last-sample preview, fetched on demand from the results-storage worker instead of kept in
  // memory for the whole run (carapace/docs/results-storage-indexeddb.md's Stage 5) — only
  // queried once the diagnostics list is actually opened, and only the one sample each node
  // needs to show here. Every recorded node now carries its full displacement vector (no
  // per-recorder DOF selection), so this is one vector per node, not one scalar per DOF.
  const [lastSamples, setLastSamples] = useState<Record<number, number[] | undefined>>({})
  useEffect(() => {
    if (!diagnosticsOpen || !carapaceRun.result || !carapaceRun.runId) return
    const runId = carapaceRun.runId
    const { sampleCount, recordedNodeTags } = carapaceRun.result
    let cancelled = false
    void (async () => {
      if (sampleCount === 0) { if (!cancelled) setLastSamples({}); return }
      const next: Record<number, number[] | undefined> = {}
      await Promise.all(recordedNodeTags.map(async (nodeTag) => {
        try {
          const reply = await queryResults(runId, String(nodeTag), sampleCount - 1, 1)
          const sample = reply.samples[0]
          if (sample) next[nodeTag] = sample.components
        } catch { /* best-effort preview; the run's own status already reports failures */ }
      }))
      if (!cancelled) setLastSamples(next)
    })()
    return () => { cancelled = true }
  }, [diagnosticsOpen, carapaceRun.result, carapaceRun.runId])

  const isGroupCollapsed = (g: DisplayGroup) => {
    if (g.count <= 1) return false
    const defaultCollapsed = g.count > AUTO_COLLAPSE_THRESHOLD
    return overrides.has(g.startIndex) ? !defaultCollapsed : defaultCollapsed
  }

  const visibleIds = groups.flatMap((g) => isGroupCollapsed(g) ? [] : Array.from({ length: g.count }, (_, k) => g.startIndex + k))

  const toggleGroup = (g: DisplayGroup) => setOverrides((prev) => {
    const next = new Set(prev)
    if (next.has(g.startIndex)) next.delete(g.startIndex); else next.add(g.startIndex)
    return next
  })

  // Click-only: sets where new commands are inserted. Reordering is handled by the sortable rows.
  const renderInsertZone = (index: number) => (
    <div className="group/zone h-2 mx-1 flex items-center cursor-pointer" onClick={() => setAnalysisInsertionIndex(index)}>
      <div className={['h-px w-full transition-colors group-hover/zone:bg-primary/50', analysisInsertionIndex === index ? 'h-0.5 bg-primary/40' : ''].join(' ')} />
    </div>
  )

  const renderCmdRow = (i: number, handle: React.HTMLAttributes<HTMLButtonElement>, indented?: boolean) => {
    const cmd = commands[i]
    const isCurrent = i === cursor
    const isFuture = i > cursor
    const isSelected = selectedAnalysisIndex === i
    const isBlock = cmd.type === 'ANALYSIS_BLOCK'
    const expanded = isBlock && expandedBlocks.has(i)
    return (
      <>
      <div className="flex items-center gap-0.5 group/row">
        <button
          {...handle}
          className="shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none px-1 py-0.5 text-[10px] leading-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >⠿</button>
        <button
          className={[
            'flex-1 text-left px-1.5 py-px rounded text-[10px] font-mono relative truncate',
            'transition-colors hover:bg-accent hover:text-accent-foreground',
            indented ? 'pl-3' : '',
            isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : '',
            isFuture ? 'opacity-30' : '',
            cmd.disabled ? 'opacity-45 line-through' : '',
          ].join(' ')}
          onClick={() => setSelectedAnalysisIndex(i)}
          onDoubleClick={() => setAnalysisInsertionIndex(i + 1)}
        >
          {isCurrent && <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-primary rounded-r" />}
          {summary(cmd)}
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className={['shrink-0 px-0.5 transition-opacity hover:text-foreground', cmd.disabled ? 'text-muted-foreground' : 'text-muted-foreground/60 opacity-0 group-hover/row:opacity-100'].join(' ')}
                onClick={() => toggleAnalysisCommandDisabled(i)}
                aria-label={cmd.disabled ? 'Enable' : 'Disable'}
                aria-pressed={!!cmd.disabled}
              >
                {cmd.disabled ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
            }
          />
          <TooltipContent>{cmd.disabled ? 'Disabled — click to enable' : 'Disable (skip without removing)'}</TooltipContent>
        </Tooltip>
        {isBlock && (
          <button
            className="shrink-0 px-0.5 text-muted-foreground/60 hover:text-foreground"
            onClick={() => toggleBlock(i)}
            aria-label={expanded ? 'Hide OpenSees commands' : 'Show OpenSees commands'}
            aria-expanded={expanded}
          >
            <ChevronRight className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      {expanded && (
        <div className={['ml-4 mb-0.5 border-l pl-1.5 text-[10px] font-mono text-muted-foreground', isFuture ? 'opacity-30' : ''].join(' ')}>
          {(() => {
            const lines = resolveAnalysisCommand(cmd, model)
            if (lines.length === 0) return <p className="py-px italic">No commands.</p>
            return lines.map((c, k) => <p key={k} className="py-px truncate" title={summary(c)}>ops.{summary(c)}</p>)
          })()}
        </div>
      )}
      </>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 flex items-center gap-2 border-b shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Analysis</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost" size="icon" className="size-6 ml-auto"
                disabled={commands.length === 0 && !busy}
                onClick={() => { if (busy) { cancelCarapaceRun() } else { setDiagnosticsOpen(true); void runCarapace() } }}
                aria-label={busy ? 'Cancel Carapace run' : 'Run in Carapace'}
              >
                {busy ? <Square className="size-3 fill-current" /> : <Play className="size-3.5" />}
              </Button>
            }
          />
          <TooltipContent>{busy ? 'Cancel run' : 'Run in Carapace'}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="py-0.5 px-0.5">
            {commands.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No analysis commands.</p>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
            {groups.map((group, gi) => {
              const collapsed = isGroupCollapsed(group)
              const showHeader = group.count > 1
              const indices = Array.from({ length: group.count }, (_, k) => group.startIndex + k)
              return (
                <div key={group.startIndex}>
                  {gi > 0 && renderInsertZone(group.startIndex)}
                  {showHeader && (
                    <button
                      className="w-full flex items-center gap-1 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-muted-foreground hover:text-accent-foreground hover:bg-accent/60 rounded transition-colors"
                      onClick={() => toggleGroup(group)}
                    >
                      <ChevronRight className={`w-2.5 h-2.5 shrink-0 transition-transform ${!collapsed ? 'rotate-90' : ''}`} />
                      <span>{CATEGORY_LABELS[group.category] ?? group.category}</span>
                      <span className="ml-auto tabular-nums opacity-50">{group.count}</span>
                    </button>
                  )}
                  {!collapsed && indices.map((absIdx, k) => (
                    <div key={absIdx}>
                      <SortableRow id={absIdx}>{(handle) => renderCmdRow(absIdx, handle, showHeader)}</SortableRow>
                      {k < group.count - 1 && renderInsertZone(absIdx + 1)}
                    </div>
                  ))}
                </div>
              )
            })}
            </SortableContext>
            </DndContext>
            {commands.length > 0 && renderInsertZone(commands.length)}
          </div>
        </ScrollArea>
      </div>
      {carapaceRun.status !== 'idle' && (
        <div className="border-t shrink-0 text-[10px]">
          <button
            className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-accent/60 transition-colors"
            onClick={() => setDiagnosticsOpen((v) => !v)}
          >
            {carapaceRun.status === 'compiling' && <><Loader2 className="size-3 animate-spin shrink-0" /><span>Compiling…</span></>}
            {carapaceRun.status === 'running' && (
              <><Loader2 className="size-3 animate-spin shrink-0" />
              <span>{carapaceRun.progress ? `Running — ${carapaceRun.progress.currentStageId ?? 'stage'}, ${carapaceRun.progress.stepsTaken} step(s)…` : 'Running…'}</span></>
            )}
            {carapaceRun.status === 'done' && <><CheckCircle2 className="size-3 shrink-0 text-emerald-600" /><span>Run complete — {carapaceRun.result?.stagesRun.length ?? 0} stage(s), {carapaceRun.result?.recordedNodeTags.length ?? 0} node(s), {carapaceRun.result?.sampleCount ?? 0} sample(s){carapaceRun.result?.modalStageCount ? `, ${carapaceRun.result.modalStageCount} modal stage(s)` : ''}</span></>}
            {carapaceRun.status === 'cancelled' && <><XCircle className="size-3 shrink-0 text-muted-foreground" /><span>Run cancelled</span></>}
            {carapaceRun.status === 'error' && <><XCircle className="size-3 shrink-0 text-destructive" /><span className="truncate">{carapaceRun.error ?? 'Run failed'}</span></>}
            {carapaceRun.diagnostics.length > 0 && <span className="ml-auto text-muted-foreground/70">{carapaceRun.diagnostics.length} diagnostic(s)</span>}
            <ChevronRight className={`size-3 shrink-0 transition-transform ${diagnosticsOpen ? 'rotate-90' : ''}`} />
          </button>
          {diagnosticsOpen && (
            <div className="max-h-32 overflow-auto px-2 pb-1.5 space-y-0.5">
              {carapaceRun.diagnostics.length === 0 && <p className="text-muted-foreground/60 py-1">No diagnostics.</p>}
              {carapaceRun.diagnostics.map((d, i) => (
                <p key={i} className={d.severity === 'error' ? 'text-destructive' : 'text-amber-600'}>
                  [{d.severity}] {d.message}
                </p>
              ))}
              {carapaceRun.result && carapaceRun.result.recordedNodeTags.map((nodeTag) => {
                const last = lastSamples[nodeTag]
                return (
                  <p key={`n${nodeTag}`} className="text-muted-foreground font-mono">
                    node[{nodeTag}]: {carapaceRun.result!.sampleCount} sample(s){last ? ` — last: [${last.map((v) => v.toPrecision(4)).join(', ')}]` : ''}
                  </p>
                )
              })}
            </div>
          )}
        </div>
      )}
      <div className="border-t px-2 py-0.5 shrink-0 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Insert: {analysisInsertionIndex === null ? 'end' : `#${analysisInsertionIndex + 1}`}</span>
        {analysisInsertionIndex !== null && (
          <button className="hover:text-foreground" onClick={() => setAnalysisInsertionIndex(null)}>reset</button>
        )}
      </div>
    </div>
  )
}
