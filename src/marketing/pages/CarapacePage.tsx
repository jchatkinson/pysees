import { Button } from '@/app/components/ui/button'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'
import { LandingFooter } from '@/marketing/components/LandingFooter'
import { Link } from 'react-router-dom'
import crab from '@/marketing/assets/crab.webp'

const REPO = 'https://github.com/jchatkinson/carapace'
const DOCS = 'https://jchatkinson.github.io/carapace/'

const COVERAGE = [
  { title: 'Elements', detail: 'Truss, elastic and fiber (displacement- and force-based) beam-columns, zero-length springs, MITC4 and DKGT shells, and 2D continuum elements, in 2D and 3D where applicable.' },
  { title: 'Materials', detail: 'Elastic, ElasticPP, Steel01/02, Concrete01/02, Hysteretic, Pinching4, Gap/Ent, plus Parallel, Series and MinMax combinators.' },
  { title: 'Analysis', detail: 'Static (load and displacement control, Newton variants, line search, arc-length), eigen (modal) and transient analysis.' },
]

export function CarapacePage() {
  return (
    <main className="min-h-screen bg-white">
      <MarketingHeader currentPath="/carapace" />
      <section className="mx-auto max-w-4xl px-4 pt-14 text-center md:px-6 md:pt-18">
        <img src={crab} alt="Carapace crab mascot" className="mx-auto mb-6 h-40 w-auto md:h-52" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">The PySees solver</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl">Carapace</h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-600">
          An open-source finite-element engine written in Rust and compiled to WebAssembly. It is what lets PySees run your model in the browser, with no server and no local OpenSees install.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Button size="lg" render={<a href={REPO} target="_blank" rel="noreferrer">View on GitHub</a>} />
          <Button size="lg" variant="secondary" render={<a href={DOCS} target="_blank" rel="noreferrer">View Docs</a>} />
          <Button size="lg" variant="outline" render={<Link to="/studio">Open Studio</Link>} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl space-y-10 px-4 py-16 md:px-6">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Built to match OpenSees</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Carapace is a from-scratch implementation of the subset of OpenSees that gets used in practice, not a port. Element and material formulations follow their OpenSees counterparts, and the PySees test suite runs the same models through Carapace and real OpenSees, requiring displacements, reactions and element forces to agree step by step.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Anything PySees can run, you can also export as an OpenSeesPy script and run in OpenSees. Carapace is meant for fast iteration in the browser, not to replace OpenSees for the full range of models it supports.
          </p>
        </div>

        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">What it covers</h2>
          <ul className="mt-5 space-y-4">
            {COVERAGE.map((c) => (
              <li key={c.title} className="text-lg leading-relaxed text-slate-600"><span className="font-semibold text-slate-900">{c.title}:</span> {c.detail}</li>
            ))}
          </ul>
          <p className="mt-5 text-slate-600">The full, current list lives in the <a className="underline" href={REPO} target="_blank" rel="noreferrer">repository README</a>.</p>
        </div>

        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">How it runs</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Your model is solved on your own machine, inside the browser tab. There is nothing to install, no queue and no upload, and the app stays responsive while a long analysis runs. Your models and results never leave your computer.
          </p>
        </div>
      </section>
      <LandingFooter />
    </main>
  )
}
