import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarketingHeader } from '@/components/MarketingHeader'
import { ChangelogSection } from '@/components/ChangelogSection'
import { LandingFooter } from '@/components/LandingFooter'
import hero1 from '@/assets/hero1.png'
import hero2 from '@/assets/hero2.png'

interface LandingPageProps {
  onEnterStudio: () => void
}

export function LandingPage({ onEnterStudio }: LandingPageProps) {
  const heroShots = [hero1, hero2]
  const [activeShot, setActiveShot] = useState(0)

  return (
    <main className="min-h-screen bg-slate-50">
      <MarketingHeader currentPath="/" />
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:px-6 md:pt-16">
        <div className="flex flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">OpenSeesPy visual pre/post</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 md:text-5xl">Parametric models without scripting first.</h1>
          <p className="mt-4 max-w-xl text-base text-slate-600">Build geometry, constraints, loads, and recorders in a history-driven GUI. Export valid Python and import recorder output for results view.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="/signup">Sign up</a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="/login">Log in</a>
            </Button>
            <Button onClick={onEnterStudio} size="lg" variant="outline">Open Studio</Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {heroShots.map((shot, idx) => (
              <button key={shot} onClick={() => setActiveShot(idx)} className={`overflow-hidden rounded-xl border bg-white ${activeShot === idx ? 'border-sky-500 shadow-sm' : 'border-slate-200'}`}>
                <img src={shot} alt={`PySees screenshot ${idx + 1}`} className="h-16 w-28 object-cover md:h-20 md:w-36" />
              </button>
            ))}
            <div className="grid h-16 w-28 place-items-center rounded-xl border border-dashed border-slate-300 text-[11px] text-slate-500 md:h-20 md:w-36">More soon</div>
          </div>
        </div>
        <div className="relative rounded-3xl border border-slate-200 bg-white p-4 shadow-lg">
          <img src={heroShots[activeShot]} alt="PySees app screenshot" className="h-full max-h-[520px] w-full rounded-2xl object-cover object-top" />
        </div>
      </section>
      <section id="features" className="border-t bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Features</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-600">Scaffold section ready for screenshots and feature callouts.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50" />
            <div className="h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50" />
            <div className="h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50" />
          </div>
        </div>
      </section>
      <ChangelogSection />
      <LandingFooter />
    </main>
  )
}
