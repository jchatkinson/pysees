import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { useAppStore } from '@/app/store/useAppStore'
import type { AnalysisCommand } from '@/app/types/analysisCommands'
import { domainForFn } from '@/app/lib/commandDomain'
import { getAnalysisBlock } from '@/app/lib/analysisBlocks'

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

export function AnalysisPanel() {
  const {
    analysisHistory,
    selectedAnalysisIndex,
    setSelectedAnalysisIndex,
    analysisInsertionIndex,
    setAnalysisInsertionIndex,
    moveAnalysisCommand,
  } = useAppStore()

  const { commands, cursor } = analysisHistory
  const groups = useMemo(() => computeGroups(commands), [commands])

  const [overrides, setOverrides] = useState<Set<number>>(new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragTarget, setDragTarget] = useState<number | null>(null)

  const isGroupCollapsed = (g: DisplayGroup) => {
    if (g.count <= 1) return false
    const defaultCollapsed = g.count > AUTO_COLLAPSE_THRESHOLD
    return overrides.has(g.startIndex) ? !defaultCollapsed : defaultCollapsed
  }

  const toggleGroup = (g: DisplayGroup) => setOverrides((prev) => {
    const next = new Set(prev)
    if (next.has(g.startIndex)) next.delete(g.startIndex); else next.add(g.startIndex)
    return next
  })

  const renderInsertZone = (index: number) => (
    <div
      className={[
        'h-1 mx-1 rounded transition-colors cursor-pointer',
        dragTarget === index ? 'bg-primary/50' : '',
        analysisInsertionIndex === index && dragTarget === null ? 'bg-primary/20' : '',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDragTarget(index) }}
      onDragLeave={() => setDragTarget((prev) => (prev === index ? null : prev))}
      onDrop={(e) => {
        e.preventDefault()
        if (dragIndex !== null) moveAnalysisCommand(dragIndex, index)
        setDragIndex(null)
        setDragTarget(null)
      }}
      onClick={() => setAnalysisInsertionIndex(index)}
    />
  )

  const renderCmdRow = (i: number, indented?: boolean) => {
    const cmd = commands[i]
    const isCurrent = i === cursor
    const isFuture = i > cursor
    const isSelected = selectedAnalysisIndex === i
    return (
      <div className="flex items-center gap-0.5 group/row">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className={[
                  'shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity',
                  'text-muted-foreground/40 hover:text-muted-foreground/80',
                  'cursor-grab active:cursor-grabbing px-0.5 text-[9px] leading-none',
                ].join(' ')}
                draggable
                onDragStart={() => { setDragIndex(i); setDragTarget(null) }}
                onDragEnd={() => { setDragIndex(null); setDragTarget(null) }}
                aria-label="Drag to reorder"
              >⠿</button>
            }
          />
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>
        <button
          className={[
            'flex-1 text-left px-1.5 py-px rounded text-[10px] font-mono relative truncate',
            'transition-colors hover:bg-accent hover:text-accent-foreground',
            indented ? 'pl-3' : '',
            isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : '',
            isFuture ? 'opacity-30' : '',
          ].join(' ')}
          onClick={() => setSelectedAnalysisIndex(i)}
          onDoubleClick={() => setAnalysisInsertionIndex(i + 1)}
        >
          {isCurrent && <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-primary rounded-r" />}
          {summary(cmd)}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground border-b shrink-0">
        Analysis
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="py-0.5 px-0.5">
            {commands.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No analysis commands.</p>
            )}
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
                      {renderCmdRow(absIdx, showHeader)}
                      {k < group.count - 1 && renderInsertZone(absIdx + 1)}
                    </div>
                  ))}
                </div>
              )
            })}
            {commands.length > 0 && renderInsertZone(commands.length)}
          </div>
        </ScrollArea>
      </div>
      <div className="border-t px-2 py-0.5 shrink-0 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Insert: {analysisInsertionIndex === null ? 'end' : `#${analysisInsertionIndex + 1}`}</span>
        {analysisInsertionIndex !== null && (
          <button className="hover:text-foreground" onClick={() => setAnalysisInsertionIndex(null)}>reset</button>
        )}
      </div>
    </div>
  )
}
