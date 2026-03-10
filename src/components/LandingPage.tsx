import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarketingHeader } from '@/components/MarketingHeader'
import { ChangelogSection } from '@/components/ChangelogSection'
import { LandingFooter } from '@/components/LandingFooter'
import { FeaturesSection } from '@/components/FeaturesSection'
import hero1 from '@/assets/hero1.png'
import hero2 from '@/assets/hero2.png'
import hero3 from '@/assets/hero3.png'
import { Link } from 'react-router-dom'
import { SignedOut } from '@clerk/clerk-react'

export function LandingPage() {
  const heroShots = [
    { src: hero1, thumbAlt: 'PySees screenshot 1' },
    { src: hero2, thumbAlt: 'PySees screenshot 2' },
    { src: hero3, thumbAlt: 'PySees screenshot 3' },
    { src: '/material_preview.gif', thumbAlt: 'PySees material preview animation' },
  ]
  const [activeShot, setActiveShot] = useState(0)
  const active = heroShots[activeShot]

  return (
    <main className="min-h-screen bg-slate-50">
      <MarketingHeader currentPath="/" />
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:px-6 md:pt-16">
        <div className="flex flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">OpenSeesPy visual pre/post-processor</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 md:text-5xl">Parametric models for OpenSeesPy.</h1>
          <p className="mt-4 max-w-xl text-base text-slate-600">Build geometry, constraints, loads, and recorders in a history-driven GUI. Export valid Python and import recorder output for results view.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <SignedOut>
              <Button asChild size="lg">
                <Link to="/signup">Sign up</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/login">Log in</Link>
              </Button>
            </SignedOut>
            <Button asChild size="lg" variant="outline">
              <Link to="/studio">Open Studio</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {heroShots.map((shot, idx) => (
              <button key={shot.src} onClick={() => setActiveShot(idx)} className={`overflow-hidden rounded-xl border bg-white ${activeShot === idx ? 'border-sky-500 shadow-sm' : 'border-slate-200'}`}>
                <img src={shot.src} alt={shot.thumbAlt} className="h-16 w-28 object-cover md:h-20 md:w-36" />
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full aspect-[4/3] rounded-3xl border border-slate-200 bg-white p-4 shadow-lg">
          <img src={active.src} alt="PySees app screenshot" className="h-full w-full rounded-2xl object-cover object-top" />
        </div>
      </section>
      <FeaturesSection />
      <ChangelogSection />
      <LandingFooter />
    </main>
  )
}
