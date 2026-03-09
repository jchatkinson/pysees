import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Undo2, Redo2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { PiscesLogo } from '@/components/icons/PiscesLogo'
import { UserButton } from '@clerk/clerk-react'

export function TopBar() {
  const {
    mode,
    setMode,
    undo,
    redo,
    history,
    viewSettings,
    setViewSetting,
    requestViewportAction,
    localAgent,
    connectLocalAgent,
    disconnectLocalAgent,
  } = useAppStore()
  const canUndo = history.cursor > 0
  const canRedo = history.cursor < history.commands.length - 1
  const checked = (v: boolean | 'indeterminate') => v === true

  return (
    <header className="h-12 border-b flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-1.5 text-sm font-semibold select-none">
        <PiscesLogo className="size-4 text-primary" aria-hidden="true" />
        PySees
      </div>
      <Separator orientation="vertical" className="self-stretch" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">File</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled>New Model</DropdownMenuItem>
          <DropdownMenuItem disabled>Export .py</DropdownMenuItem>
          <DropdownMenuSeparator />
          {localAgent.status === 'connected' ? (
            <DropdownMenuItem onSelect={disconnectLocalAgent}>
              Disconnect local instance (:{localAgent.port})
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => { void connectLocalAgent() }} disabled={localAgent.status === 'connecting'}>
              {localAgent.status === 'connecting' ? 'Connecting to local instance...' : 'Connect to local instance'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">Edit</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={undo} disabled={!canUndo}>
            Undo
            <Undo2 className="ml-auto size-3.5" />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={redo} disabled={!canRedo}>
            Redo
            <Redo2 className="ml-auto size-3.5" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">View</Button>
        </DropdownMenuTrigger>
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
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={mode === 'results'} onCheckedChange={(v) => setMode(checked(v) ? 'results' : 'model')}>Results Mode</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => requestViewportAction('zoomIn')}>Zoom In</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestViewportAction('zoomOut')}>Zoom Out</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestViewportAction('fit')}>Zoom To Fit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="self-stretch" />
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8" onClick={undo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={redo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </Button>
      </div>
      <span className="ml-auto text-xs text-muted-foreground">{mode === 'model' ? 'Model' : 'Results'}</span>
      <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'h-7 w-7' } }} />
    </header>
  )
}
