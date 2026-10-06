import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/app/components/ui/resizable'
import { TopBar } from '@/app/components/TopBar'
import { ActionBar } from '@/app/components/ActionBar'
import { ModelPanel } from '@/app/components/ModelPanel'
import { AnalysisPanel } from '@/app/components/AnalysisPanel'
import { ReportPanel } from '@/app/components/ReportPanel'
import { CommandForm } from '@/app/components/CommandForm'
import { ResultsPanel } from '@/app/components/ResultsPanel'
import { Viewport } from '@/app/components/Viewport'
import { InitModal } from '@/app/components/InitModal'
import { GridlinesDialog } from '@/app/components/GridlinesDialog'
import { MaterialDialog } from '@/app/components/MaterialDialog'
import { SectionDialog } from '@/app/components/sections/SectionDialog'
import { Button } from '@/app/components/ui/button'
import { useAppStore } from '@/app/store/useAppStore'

function LeftPanel() {
  const activePanel = useAppStore((s) => s.activePanel)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b shrink-0">
        {([['model', 'Model'], ['analysis', 'Analysis'], ['report', 'Report']] as const).map(([id, label]) => (
          <Button key={id} variant="ghost" className={`flex-1 h-7 rounded-none text-[11px] ${activePanel === id ? 'bg-accent text-accent-foreground' : ''}`} onClick={() => setActivePanel(id)}>{label}</Button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {activePanel === 'model' ? <ModelPanel /> : activePanel === 'analysis' ? <AnalysisPanel /> : <ReportPanel />}
      </div>
    </div>
  )
}

function RightPanel() {
  const activeRightPanel = useAppStore((s) => s.activeRightPanel)
  const setActiveRightPanel = useAppStore((s) => s.setActiveRightPanel)
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b shrink-0">
        <Button
          variant="ghost"
          className={`flex-1 h-7 rounded-none text-[11px] ${activeRightPanel === 'command' ? 'bg-accent text-accent-foreground' : ''}`}
          onClick={() => setActiveRightPanel('command')}
        >
          Command
        </Button>
        <Button
          variant="ghost"
          className={`flex-1 h-7 rounded-none text-[11px] ${activeRightPanel === 'results' ? 'bg-accent text-accent-foreground' : ''}`}
          onClick={() => setActiveRightPanel('results')}
        >
          Results
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        {activeRightPanel === 'command' ? <CommandForm /> : <ResultsPanel />}
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <InitModal />
      <GridlinesDialog />
      <MaterialDialog />
      <SectionDialog />
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
            <RightPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <ActionBar />
    </div>
  )
}
