import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/AppShell'
import { LandingPage } from '@/components/LandingPage'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { MarketingSimplePage } from '@/components/MarketingSimplePage'
import { AboutPage } from '@/components/AboutPage'

const APP_ROUTE = '/studio'
const KNOWN_ROUTES = ['/', APP_ROUTE, '/about', '/contact', '/signup', '/login']

function navigate(path: string) {
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <TooltipProvider>
      {pathname === '/' && <LandingPage onEnterStudio={() => navigate(APP_ROUTE)} />}
      {pathname === APP_ROUTE && <AppShell />}
      {pathname === '/about' && <AboutPage />}
      {pathname === '/contact' && <MarketingSimplePage title="Contact" description="Contact page scaffold. Add channels, response expectations, and support options here." />}
      {pathname === '/signup' && <MarketingSimplePage title="Sign up" description="Signup page scaffold. Replace with auth flow when ready." />}
      {pathname === '/login' && <MarketingSimplePage title="Log in" description="Login page scaffold. Replace with auth flow when ready." />}
      {!KNOWN_ROUTES.includes(pathname) && (
        <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
          <section className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500">Page not found</p>
            <h1 className="mt-1 text-lg font-semibold">Use the PySees studio route</h1>
            <Button className="mt-4" onClick={() => navigate(APP_ROUTE)}>Go to Studio</Button>
          </section>
        </main>
      )}
    </TooltipProvider>
  )
}

export default App
