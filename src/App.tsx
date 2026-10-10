import { TooltipProvider } from '@/app/components/ui/tooltip'
import { AppShell } from '@/app/components/AppShell'
import { LandingPage } from '@/marketing/pages/LandingPage'
import { Button } from '@/app/components/ui/button'
import { AboutPage } from '@/marketing/pages/AboutPage'
import { CarapacePage } from '@/marketing/pages/CarapacePage'
import { ContactPage } from '@/marketing/pages/ContactPage'
import { TermsPage } from '@/marketing/pages/TermsPage'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

function HashScrollHandler() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const id = hash.replace('#', '')
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [hash])
  return null
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-500">Page not found</p>
        <h1 className="mt-1 text-lg font-semibold">Use the PySees studio route</h1>
        <Button className="mt-4" render={<Link to="/studio">Go to Studio</Link>} />
      </section>
    </main>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <HashScrollHandler />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/studio" element={<AppShell />} />
        <Route path="/carapace" element={<CarapacePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/signup/*" element={<Navigate to="/studio" replace />} />
        <Route path="/login/*" element={<Navigate to="/studio" replace />} />
        <Route path="/app" element={<Navigate to="/studio" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  )
}

export default App
