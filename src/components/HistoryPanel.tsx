import { Fragment, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/useAppStore'
import type { Command } from '@/types/commands'

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

function isRecorderCommand(cmd: Command) {
  return cmd.type === 'ADD_RECORDER' || (cmd.type === 'ADD_OPS' && cmd.category === 'recorder')
}

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
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const { commands, cursor } = history
  const affectedSet = new Set(affectedHistoryIndices)

  const renderInsertionTarget = (index: number) => (
    <button
      key={`insert-${index}`}
      className={[
        'w-full h-3 rounded-sm transition-colors relative',
        index === 0 ? 'hidden' : '',
        insertionIndex === index ? 'bg-primary/20' : 'hover:bg-accent/60',
      ].join(' ')}
      onClick={() => setInsertionIndex(index)}
      onDragOver={(e) => { e.preventDefault(); setInsertionIndex(index) }}
      onDrop={(e) => {
        e.preventDefault()
        if (dragIndex === null) return
        moveCommand(dragIndex, index)
        setDragIndex(null)
      }}
      title={`Insert at ${index + 1}`}
    >
      {insertionIndex === index && <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-px bg-primary" />}
    </button>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">History</div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {commands.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No commands yet.</p>
          )}
          {commands.map((cmd, i) => {
            const isRecorder = isRecorderCommand(cmd)
            const isCurrent = i === cursor
            const isFuture = i > cursor
            const isAffected = i <= cursor && affectedSet.has(i)
            return (
              <Fragment key={i}>
                {isRecorder && i > 0 && !isRecorderCommand(commands[i - 1]) && (
                  <Separator className="my-1" />
                )}
                <div className="flex items-center gap-1">
                  <button
                    className={[
                      'shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing px-1 text-[10px]',
                      i <= 0 ? 'opacity-0 pointer-events-none' : '',
                    ].join(' ')}
                    draggable={i > 0}
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={() => setDragIndex(null)}
                    title="Drag to reorder"
                  >
                    ::
                  </button>
                  <button
                    className={[
                      'w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors relative',
                      'hover:bg-accent',
                      selectedHistoryIndex === i ? 'ring-1 ring-primary/50 bg-primary/10' : '',
                      isAffected ? 'bg-amber-100/60 dark:bg-amber-900/25 ring-1 ring-amber-300/70 dark:ring-amber-700/50' : '',
                      isFuture ? 'opacity-40' : '',
                      isRecorder ? 'text-muted-foreground' : '',
                    ].join(' ')}
                    onClick={() => setSelectedHistoryIndex(i)}
                    onDoubleClick={() => setInsertionIndex(i)}
                  >
                    {isCurrent && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary/70 rounded" />}
                    {summary(cmd)}
                  </button>
                </div>
                {i + 1 < commands.length && renderInsertionTarget(i + 1)}
              </Fragment>
            )
          })}
          {commands.length > 0 && renderInsertionTarget(commands.length)}
        </div>
      </ScrollArea>
      <div className="border-t p-2 shrink-0">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
          <span>Insert: {insertionIndex === null ? 'end' : `${insertionIndex + 1}`}</span>
          <button className="hover:text-foreground" onClick={() => setInsertionIndex(null)}>reset</button>
        </div>
      </div>
    </div>
  )
}
