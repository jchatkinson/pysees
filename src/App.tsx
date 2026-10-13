import { TooltipProvider } from '@/app/components/ui/tooltip'
import { Button } from '@/app/components/ui/button'
import { marketingRoutes } from '@/marketing/routes'
import { Seo } from '@/marketing/Seo'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'

// The studio (three.js, charts, workers) is its own chunk so marketing pages stay light.
const AppShell = lazy(() => import('@/app/components/AppShell').then(m => ({ default: m.AppShell })))

function HashScrollHandler() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const id = hash.replace('#', '')
    requestAnimationFrame(() => {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      if (!el.hasAttribute('tabindex') && !/^(a|button|input|select|textarea)$/i.test(el.tagName)) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
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
      <Seo />
      <HashScrollHandler />
      <Routes>
        {marketingRoutes}
        <Route path="/studio" element={<Suspense fallback={<div role="status" className="grid min-h-screen place-items-center text-sm text-slate-500">Loading studio…</div>}><AppShell /></Suspense>} />
        <Route path="/signup/*" element={<Navigate to="/studio" replace />} />
        <Route path="/login/*" element={<Navigate to="/studio" replace />} />
        <Route path="/app" element={<Navigate to="/studio" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  )
}

export default App
