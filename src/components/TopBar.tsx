import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Undo2, Redo2, Download, Triangle } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

export function TopBar() {
  const { mode, setMode, undo, redo, history } = useAppStore()
  const canUndo = history.cursor > 0
  const canRedo = history.cursor < history.commands.length - 1

  return (
    <header className="h-12 border-b flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-1.5 text-sm font-semibold select-none">
        <Triangle className="size-4 text-primary fill-primary" />
        PySees
      </div>
      <Separator orientation="vertical" className="self-stretch" />
      <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as 'model' | 'results')}>
        <ToggleGroupItem value="model" className="text-xs px-3 h-8">Model</ToggleGroupItem>
        <ToggleGroupItem value="results" className="text-xs px-3 h-8">Results</ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="self-stretch" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>
      <div className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="size-3.5" />
              Export .py
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download Python script</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
