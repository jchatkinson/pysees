import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { TopBar } from '@/components/TopBar'
import { ActionBar } from '@/components/ActionBar'
import { HistoryPanel } from '@/components/HistoryPanel'
import { CommandForm } from '@/components/CommandForm'
import { Viewport } from '@/components/Viewport'
import { InitModal } from '@/components/InitModal'

export function AppShell() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <InitModal />
      <TopBar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
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
