import { Button } from '@/components/ui/button'
import { PiscesLogo } from '@/components/icons/PiscesLogo'

export function LandingFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="md:col-span-1">
          <a href="/" className="flex items-center gap-2">
            <PiscesLogo className="h-6 w-6 text-sky-600" />
            <span className="text-xl font-semibold tracking-tight text-slate-900">PySees</span>
          </a>
          <p className="mt-4 max-w-xs text-sm text-slate-600">
            Modelling and Post-Processing for OpenseesPy.
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-900">Product</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li><a className="hover:text-slate-900" href="/#features">Features</a></li>
            <li><a className="hover:text-slate-900" href="/#changelog">Change Log</a></li>
            <li><a className="hover:text-slate-900" href="/studio">Studio</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-900">Company</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li><a className="hover:text-slate-900" href="/about">About</a></li>
            <li><a className="hover:text-slate-900" href="/contact">Contact</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-900">Ready to Start?</h3>
          <p className="mt-4 text-sm text-slate-600">Create an account to save models and stay updated as features ship.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="lg">
              <a href="/signup">Sign up</a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="/login">Log in</a>
            </Button>
          </div>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 text-xs text-slate-500 md:px-6">
          <p>©2026 PySees.app</p>
          <p>Built for structural modeling workflows.</p>
        </div>
      </div>
    </footer>
  )
}
