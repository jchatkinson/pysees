import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/AppShell'

export function App() {
  return (
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  )
}

export default App