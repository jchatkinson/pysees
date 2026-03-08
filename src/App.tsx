import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/AppShell'
import { LandingPage } from '@/components/LandingPage'
import { Button } from '@/components/ui/button'
import { AboutPage } from '@/components/AboutPage'
import { ContactPage } from '@/components/ContactPage'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RedirectToSignIn, SignIn, SignUp, SignedIn, SignedOut } from '@clerk/clerk-react'
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

function StudioRoute() {
  return (
    <>
      <SignedIn>
        <AppShell />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn redirectUrl="/studio" />
      </SignedOut>
    </>
  )
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      {mode === 'sign-in' ? (
        <SignIn routing="path" path="/login" signUpUrl="/signup" fallbackRedirectUrl="/studio" />
      ) : (
        <SignUp routing="path" path="/signup" signInUrl="/login" fallbackRedirectUrl="/studio" />
      )}
    </main>
  )
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="rounded-xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-500">Page not found</p>
        <h1 className="mt-1 text-lg font-semibold">Use the PySees studio route</h1>
        <Button className="mt-4" asChild>
          <Link to="/studio">Go to Studio</Link>
        </Button>
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
        <Route path="/studio" element={<StudioRoute />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/signup" element={<AuthPage mode="sign-up" />} />
        <Route path="/login" element={<AuthPage mode="sign-in" />} />
        <Route path="/app" element={<Navigate to="/studio" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  )
}

export default App
