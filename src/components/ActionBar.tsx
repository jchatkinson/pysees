import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ZoomIn, ZoomOut, Maximize2, Box } from 'lucide-react'

export function ActionBar() {
  return (
    <footer className="h-9 border-t flex items-center px-3 gap-2 shrink-0 text-xs text-muted-foreground">
      <span className="flex-1 truncate">Ready</span>
      <Separator orientation="vertical" className="self-stretch" />
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <ZoomIn className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <ZoomOut className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <Maximize2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit to view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <Box className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle perspective / orthographic</TooltipContent>
        </Tooltip>
      </div>
      <Separator orientation="vertical" className="self-stretch" />
      <span className="font-mono text-[11px] tabular-nums">x: — &nbsp;y: — &nbsp;z: —</span>
    </footer>
  )
}
