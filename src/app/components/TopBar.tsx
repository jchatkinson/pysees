import { Button } from '@/app/components/ui/button'
import { Separator } from '@/app/components/ui/separator'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/app/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { Undo2, Redo2 } from 'lucide-react'
import { useAppStore } from '@/app/store/useAppStore'
import { PiscesLogo } from '@/app/components/icons/PiscesLogo'
import { UserButton } from '@clerk/clerk-react'
import { downloadScript } from '@/app/lib/exportScript'

export function TopBar() {
  const {
    mode,
    setMode,
    activePanel,
    model,
    modelPast,
    modelFuture,
    modelUndo,
    modelRedo,
    analysisHistory,
    analysisUndo,
    analysisRedo,
    viewSettings,
    setViewSetting,
    requestViewportAction,
    setGridlinesDialogOpen,
    localAgent,
    connectLocalAgent,
    disconnectLocalAgent,
  } = useAppStore()
  const undo = activePanel === 'model' ? modelUndo : analysisUndo
  const redo = activePanel === 'model' ? modelRedo : analysisRedo
  const canUndo = activePanel === 'model' ? modelPast.length > 0 : analysisHistory.cursor > -1
  const canRedo = activePanel === 'model' ? modelFuture.length > 0 : analysisHistory.cursor < analysisHistory.commands.length - 1
  const checked = (v: boolean | 'indeterminate') => v === true

  return (
    <header className="h-12 border-b flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-1.5 text-sm font-semibold select-none">
        <PiscesLogo className="size-4 text-primary" aria-hidden="true" />
        PySees
      </div>
      <Separator orientation="vertical" className="self-stretch" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 px-2 text-xs">File</Button>} />
        <DropdownMenuContent>
          <DropdownMenuItem disabled>New Model</DropdownMenuItem>
          <DropdownMenuItem disabled={!model.config} onClick={() => downloadScript(model, analysisHistory)}>Export .py</DropdownMenuItem>
          <DropdownMenuSeparator />
          {localAgent.status === 'connected' ? (
            <DropdownMenuItem onClick={disconnectLocalAgent}>
              Disconnect (:{localAgent.port})
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => { void connectLocalAgent() }} disabled={localAgent.status === 'connecting'}>
              {localAgent.status === 'connecting' ? 'Connecting to local...' : 'Connect to local'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 px-2 text-xs">Edit</Button>} />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={undo} disabled={!canUndo}>
            Undo
            <Undo2 className="ml-auto size-3.5" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={redo} disabled={!canRedo}>
            Redo
            <Redo2 className="ml-auto size-3.5" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 px-2 text-xs">View</Button>} />
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={viewSettings.showNodeIds} onCheckedChange={(v) => setViewSetting('showNodeIds', checked(v))}>Node IDs</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showElementIds} onCheckedChange={(v) => setViewSetting('showElementIds', checked(v))}>Element IDs</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={viewSettings.showNodes} onCheckedChange={(v) => setViewSetting('showNodes', checked(v))}>Nodes</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showElements} onCheckedChange={(v) => setViewSetting('showElements', checked(v))}>Elements</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showSupports} onCheckedChange={(v) => setViewSetting('showSupports', checked(v))}>Supports</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showNodalLoads} onCheckedChange={(v) => setViewSetting('showNodalLoads', checked(v))}>Nodal Loads</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showElementLoads} onCheckedChange={(v) => setViewSetting('showElementLoads', checked(v))}>Element Loads</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showGrid} onCheckedChange={(v) => setViewSetting('showGrid', checked(v))}>Grid</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={viewSettings.showGridlines} onCheckedChange={(v) => setViewSetting('showGridlines', checked(v))}>Gridlines</DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={() => setGridlinesDialogOpen(true)}>Gridlines…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={mode === 'results'} onCheckedChange={(v) => setMode(checked(v) ? 'results' : 'model')}>Results Mode</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => requestViewportAction('zoomIn')}>Zoom In</DropdownMenuItem>
          <DropdownMenuItem onClick={() => requestViewportAction('zoomOut')}>Zoom Out</DropdownMenuItem>
          <DropdownMenuItem onClick={() => requestViewportAction('fit')}>Zoom To Fit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="self-stretch" />
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" className="size-8" aria-label="Undo" onClick={undo} disabled={!canUndo}>
                <Undo2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Undo</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" className="size-8" aria-label="Redo" onClick={redo} disabled={!canRedo}>
                <Redo2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
      </div>
      <span className="ml-auto text-xs text-muted-foreground">{mode === 'model' ? 'Model' : 'Results'}</span>
      <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'h-7 w-7' } }} />
    </header>
  )
}
