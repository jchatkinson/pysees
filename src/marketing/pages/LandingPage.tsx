import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'
import { ChangelogSection } from '@/marketing/components/ChangelogSection'
import { LandingFooter } from '@/marketing/components/LandingFooter'
import { FeaturesSection } from '@/marketing/components/FeaturesSection'
import hero1 from '@/marketing/assets/hero1.webp'
import heroTemplates from '@/marketing/assets/hero-templates.webp'
import heroMoment from '@/marketing/assets/hero-moment-diagram.webp'
import heroDeformed from '@/marketing/assets/hero-deformed-shape.webp'
import heroMode from '@/marketing/assets/hero-mode-shape.gif'
import { Link } from 'react-router-dom'

export function LandingPage() {
  const heroShots = [
    { src: hero1, thumbAlt: 'PySees Studio with a 3D frame model, the model panel and command forms' },
    { src: heroTemplates, thumbAlt: 'PySees new-model dialog with template previews' },
    { src: '/material_preview.gif', thumbAlt: 'Animated hysteresis loop in the PySees material preview' },
    { src: heroMoment, thumbAlt: 'Bending moment diagrams on a 2D frame' },
    { src: heroDeformed, thumbAlt: 'Deformed shape of a 2D frame under pushover loading' },
    { src: heroMode, thumbAlt: 'Animated first mode shape of a 2D frame' },
  ]
  const [activeShot, setActiveShot] = useState(0)
  const active = heroShots[activeShot]

  return (
    <main id="main" tabIndex={-1} className="outline-none min-h-screen bg-slate-50">
      <MarketingHeader currentPath="/" />
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-10 md:grid-cols-2 md:px-6 md:pt-16">
        <div className="flex flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-700">OpenSeesPy modeling, analysis and results</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 md:text-5xl">Build, analyze and review structural models.</h1>
          <p className="mt-4 max-w-xl text-base text-slate-600">Model 2D and 3D frames, trusses and shells with OpenSees commands behind every form. Run static, eigen and transient analyses right in the browser, explore deformed shapes, force diagrams and plots, then export a valid OpenSeesPy script when you want to run it in OpenSees.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" render={<Link to="/studio">Open Studio</Link>} />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {heroShots.map((shot, idx) => (
              <button key={shot.src} type="button" aria-label={shot.thumbAlt} aria-pressed={activeShot === idx} onClick={() => setActiveShot(idx)} className={`overflow-hidden rounded-xl border bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${activeShot === idx ? 'border-sky-500 shadow-sm' : 'border-slate-200'}`}>
                <img src={shot.src} alt="" width={144} height={80} loading={idx === 0 ? undefined : 'lazy'} decoding="async" className="h-16 w-28 object-cover md:h-20 md:w-36" />
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full aspect-[4/3] rounded-3xl border border-slate-200 bg-white p-4 shadow-lg">
          <img src={active.src} alt={active.thumbAlt} width={1200} height={900} fetchPriority="high" decoding="async" className="h-full w-full rounded-2xl object-cover object-top" />
        </div>
      </section>
      <FeaturesSection />
      <ChangelogSection />
      <LandingFooter />
    </main>
  )
}
