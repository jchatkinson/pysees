import { Fragment } from 'react'
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
    case 'SCRIPT_GROUP': return `script  (${cmd.commands.length} cmds)`
  }
}

const recorderTypes = new Set<Command['type']>(['ADD_RECORDER'])

export function HistoryPanel() {
  const { history, selectedHistoryIndex, setSelectedHistoryIndex, affectedHistoryIndices } = useAppStore()
  const { commands, cursor } = history
  const affectedSet = new Set(affectedHistoryIndices)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">History</div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {commands.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No commands yet.</p>
          )}
          {commands.map((cmd, i) => {
            const isRecorder = recorderTypes.has(cmd.type)
            const isCurrent = i === cursor
            const isFuture = i > cursor
            const isAffected = i <= cursor && affectedSet.has(i)
            return (
              <Fragment key={i}>
                {isRecorder && i > 0 && !recorderTypes.has(commands[i - 1].type) && (
                  <Separator className="my-1" />
                )}
                <button
                  className={[
                    'w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors',
                    'hover:bg-accent',
                    isCurrent ? 'bg-accent' : '',
                    selectedHistoryIndex === i ? 'ring-1 ring-primary/40 bg-accent/70' : '',
                    isAffected ? 'bg-amber-100/60 dark:bg-amber-900/25 ring-1 ring-amber-300/70 dark:ring-amber-700/50' : '',
                    isFuture ? 'opacity-40' : '',
                    isRecorder ? 'text-muted-foreground' : '',
                  ].join(' ')}
                  onClick={() => setSelectedHistoryIndex(i)}
                >
                  {summary(cmd)}
                </button>
              </Fragment>
            )
          })}
        </div>
      </ScrollArea>
      <div className="border-t p-2 shrink-0">
        <button className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded py-1.5 transition-colors">
          + Script
        </button>
      </div>
    </div>
  )
}
