import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/store/useAppStore'
import type { Command } from '@/types/commands'

// ─── categorization ──────────────────────────────────────────────────────────

function cmdCategory(cmd: Command): string {
  switch (cmd.type) {
    case 'MODEL_INIT': return 'init'
    case 'ADD_NODE': return 'nodes'
    case 'ADD_MATERIAL': return 'materials'
    case 'ADD_ELEMENT': return 'elements'
    case 'FIX': return 'bc'
    case 'ADD_LOAD': return 'loads'
    case 'ADD_RECORDER': return 'recorders'
    case 'ADD_OPS': return cmd.category === 'recorder' ? 'recorders' : 'ops'
    case 'SCRIPT_GROUP': return 'script'
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  init: 'Model',
  nodes: 'Nodes',
  materials: 'Materials',
  elements: 'Elements',
  bc: 'BCs',
  loads: 'Loads',
  recorders: 'Recorders',
  ops: 'Ops',
  script: 'Script',
}

// ─── summary ─────────────────────────────────────────────────────────────────

function summary(cmd: Command): string {
  switch (cmd.type) {
    case 'MODEL_INIT': return `model  ndm=${cmd.ndm}  ndf=${cmd.ndf}`
    case 'ADD_NODE': return `node ${cmd.id}  [${cmd.coords.join(', ')}]`
    case 'ADD_ELEMENT': return `${cmd.eleType} ${cmd.id}`
    case 'ADD_MATERIAL': return `material ${cmd.id}  ${cmd.matType}`
    case 'FIX': return `fix  node ${cmd.nodeId}`
    case 'ADD_LOAD': return `load  node ${cmd.nodeId}`
    case 'ADD_RECORDER': return `recorder  ${cmd.recorderType}`
    case 'ADD_OPS': return `${cmd.fn}  (${Object.keys(cmd.values).length} args)`
    case 'SCRIPT_GROUP': return `script  (${cmd.commands.length} cmds)`
  }
}

// ─── grouping ────────────────────────────────────────────────────────────────

type DisplayGroup = {
  category: string
  startIndex: number
  endIndex: number  // inclusive
  count: number
}

function computeGroups(commands: Command[]): DisplayGroup[] {
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

// Groups with more items than this threshold start collapsed
const AUTO_COLLAPSE_THRESHOLD = 4

// ─── component ───────────────────────────────────────────────────────────────

export function HistoryPanel() {
  const {
    history,
    selectedHistoryIndex,
    setSelectedHistoryIndex,
    affectedHistoryIndices,
    insertionIndex,
    setInsertionIndex,
    moveCommand,
  } = useAppStore()

  const { commands, cursor } = history
  const affectedSet = new Set(affectedHistoryIndices)
  const groups = useMemo(() => computeGroups(commands), [commands])

  // Set of group startIndices whose collapsed state is flipped from the default
  const [overrides, setOverrides] = useState<Set<number>>(new Set())
  // Local drag state — does NOT bleed into insertionIndex while hovering
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragTarget, setDragTarget] = useState<number | null>(null)

  const isGroupCollapsed = (g: DisplayGroup) => {
    if (g.count <= 1) return false
    const defaultCollapsed = g.count > AUTO_COLLAPSE_THRESHOLD
    return overrides.has(g.startIndex) ? !defaultCollapsed : defaultCollapsed
  }

  const toggleGroup = (g: DisplayGroup) => {
    setOverrides(prev => {
      const next = new Set(prev)
      next.has(g.startIndex) ? next.delete(g.startIndex) : next.add(g.startIndex)
      return next
    })
  }

  // Thin drop-zone strip between items. Click to set insertionIndex; drag to reorder.
  const renderInsertZone = (index: number) => (
    <div
      className={[
        'h-1 mx-1 rounded transition-colors cursor-pointer',
        dragTarget === index ? 'bg-primary/50' : '',
        insertionIndex === index && dragTarget === null ? 'bg-primary/20' : '',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDragTarget(index) }}
      onDragLeave={() => setDragTarget(prev => prev === index ? null : prev)}
      onDrop={(e) => {
        e.preventDefault()
        if (dragIndex !== null) moveCommand(dragIndex, index)
        setDragIndex(null)
        setDragTarget(null)
      }}
      onClick={() => setInsertionIndex(index)}
    />
  )

  const renderCmdRow = (i: number, indented?: boolean) => {
    const cmd = commands[i]
    const isCurrent = i === cursor
    const isFuture = i > cursor
    const isAffected = i <= cursor && affectedSet.has(i)
    const isSelected = selectedHistoryIndex === i
    return (
      <div className="flex items-center gap-0.5 group/row">
        <button
          className={[
            'shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity',
            'text-muted-foreground/40 hover:text-muted-foreground/80',
            'cursor-grab active:cursor-grabbing px-0.5 text-[9px] leading-none',
            i <= 0 ? '!opacity-0 pointer-events-none' : '',
          ].join(' ')}
          draggable={i > 0}
          onDragStart={() => { setDragIndex(i); setDragTarget(null) }}
          onDragEnd={() => { setDragIndex(null); setDragTarget(null) }}
          title="Drag to reorder"
        >⠿</button>
        <button
          className={[
            'flex-1 text-left px-1.5 py-px rounded text-[10px] font-mono relative truncate',
            'transition-colors hover:bg-accent',
            indented ? 'pl-3' : '',
            isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : '',
            isAffected ? 'bg-amber-50 dark:bg-amber-950/40' : '',
            isFuture ? 'opacity-30' : '',
          ].join(' ')}
          onClick={() => setSelectedHistoryIndex(i)}
          onDoubleClick={() => setInsertionIndex(i + 1)}
        >
          {isCurrent && (
            <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-primary rounded-r" />
          )}
          {summary(cmd)}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* panel header */}
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground border-b shrink-0">
        History
      </div>

      {/* scrollable body — wrapper gives ScrollArea a concrete height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="py-0.5 px-0.5">
            {commands.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No commands.</p>
            )}

            {groups.map((group, gi) => {
              const collapsed = isGroupCollapsed(group)
              const showHeader = group.count > 1
              const indices = Array.from({ length: group.count }, (_, k) => group.startIndex + k)

              return (
                <div key={group.startIndex}>
                  {/* insert zone between groups (not before the very first) */}
                  {gi > 0 && renderInsertZone(group.startIndex)}

                  {/* group header row */}
                  {showHeader && (
                    <button
                      className="w-full flex items-center gap-1 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded transition-colors"
                      onClick={() => toggleGroup(group)}
                    >
                      <ChevronRight
                        className={`w-2.5 h-2.5 shrink-0 transition-transform ${!collapsed ? 'rotate-90' : ''}`}
                      />
                      <span>{CATEGORY_LABELS[group.category] ?? group.category}</span>
                      <span className="ml-auto tabular-nums opacity-50">{group.count}</span>
                    </button>
                  )}

                  {/* individual command rows */}
                  {!collapsed && indices.map((absIdx, k) => (
                    <div key={absIdx}>
                      {renderCmdRow(absIdx, showHeader)}
                      {k < group.count - 1 && renderInsertZone(absIdx + 1)}
                    </div>
                  ))}
                </div>
              )
            })}

            {/* insert zone at the very end */}
            {commands.length > 0 && renderInsertZone(commands.length)}
          </div>
        </ScrollArea>
      </div>

      {/* footer: insertion point indicator */}
      <div className="border-t px-2 py-0.5 shrink-0 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Insert: {insertionIndex === null ? 'end' : `#${insertionIndex + 1}`}</span>
        {insertionIndex !== null && (
          <button className="hover:text-foreground" onClick={() => setInsertionIndex(null)}>
            reset
          </button>
        )}
      </div>
    </div>
  )
}
