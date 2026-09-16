import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/app/components/ui/resizable'
import { TopBar } from '@/app/components/TopBar'
import { ActionBar } from '@/app/components/ActionBar'
import { HistoryPanel } from '@/app/components/HistoryPanel'
import { CommandForm } from '@/app/components/CommandForm'
import { Viewport } from '@/app/components/Viewport'
import { InitModal } from '@/app/components/InitModal'

export function AppShell() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <InitModal />
      <TopBar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="20%">
            <HistoryPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="55%">
            <Viewport />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="25%">
            <CommandForm />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <ActionBar />
    </div>
  )
}
