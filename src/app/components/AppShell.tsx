import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/app/components/ui/resizable'
import { TopBar } from '@/app/components/TopBar'
import { ActionBar } from '@/app/components/ActionBar'
import { ModelPanel } from '@/app/components/ModelPanel'
import { AnalysisPanel } from '@/app/components/AnalysisPanel'
import { CommandForm } from '@/app/components/CommandForm'
import { Viewport } from '@/app/components/Viewport'
import { InitModal } from '@/app/components/InitModal'
import { Button } from '@/app/components/ui/button'
import { useAppStore } from '@/app/store/useAppStore'

function LeftPanel() {
  const activePanel = useAppStore((s) => s.activePanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b shrink-0">
        <Button
          variant="ghost"
          className={`flex-1 h-7 rounded-none text-[11px] ${activePanel === 'model' ? 'bg-accent' : ''}`}
          onClick={() => setActivePanel('model')}
        >
          Model
        </Button>
        <Button
          variant="ghost"
          className={`flex-1 h-7 rounded-none text-[11px] ${activePanel === 'analysis' ? 'bg-accent' : ''}`}
          onClick={() => setActivePanel('analysis')}
        >
          Analysis
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        {activePanel === 'model' ? <ModelPanel /> : <AnalysisPanel />}
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <InitModal />
      <TopBar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="20%">
            <LeftPanel />
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
