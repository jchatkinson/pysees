import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CircleCheck, Download, ExternalLink, Info, Play } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'
import { LandingFooter } from '@/marketing/components/LandingFooter'
import { Markdown } from '@/marketing/docs/Markdown'
import { CATEGORIES, RTOL, type CaseResult } from '@/app/lib/verification/types'
import { CASE_PAGES, CARAPACE_REPO, INDEX, PYSEES_REPO, agreement, carapaceUrl, categoryTitle, findCase, loadCase, sci, shot, sourceUrl, type VerificationCasePage } from './content'

const CasePlot = lazy(() => import('./CasePlot'))
const QUANTITY: Record<string, string> = { disp: 'Displacements', vel: 'Velocities', accel: 'Relative accelerations', reaction: 'Support reactions', force: 'Element forces', shell: 'Shell stress resultants' }
const NOT_VERIFIED = [
  ['Stud walls, joist floors and flexible diaphragms', 'These are Carapace elements with no OpenSees equivalent. The exported script approximates each wall and diaphragm bay with elastic shells, so the two runs are not the same model. The test suite checks that the exported building runs in OpenSees and carries the same total load.'],
  ['Friction in zero-length elements', 'Coulomb friction in a zeroLength is a Carapace feature. The exported script writes the element without it, with a warning.'],
  ['A second pushover on a new load pattern', 'Starting a new displacement-controlled pattern without holding the previous one is not compared: OpenSees ends that analysis out of equilibrium (its reported pattern factor does not match the reactions). Hold the earlier loads first, or push all patterns together.'],
] as const

function Badge({ c }: { c: VerificationCasePage }) {
  return c.knownDifference
    ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"><Info className="h-3 w-3" />Known difference · {agreement(c)}</span>
    : <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"><CircleCheck className="h-3 w-3" />{agreement(c)}</span>
}

function Engines() {
  return (
    <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm text-slate-600 sm:grid-cols-3">
      <div><dt className="font-medium text-slate-900">Carapace</dt><dd><a className="font-mono underline" href={`${CARAPACE_REPO}/commit/${INDEX.carapace.commit}`} target="_blank" rel="noreferrer">{INDEX.carapace.commit.slice(0, 7)}</a> (WebAssembly build in PySees)</dd></div>
      <div><dt className="font-medium text-slate-900">OpenSees</dt><dd>{INDEX.opensees.package} {INDEX.opensees.version}</dd></div>
      <div><dt className="font-medium text-slate-900">Generated</dt><dd>{INDEX.generated} from <a className="font-mono underline" href={`${PYSEES_REPO}/commit/${INDEX.pysees.commit}`} target="_blank" rel="noreferrer">{INDEX.pysees.commit.slice(0, 7)}</a></dd></div>
    </dl>
  )
}

function IndexPage() {
  const exact = CASE_PAGES.filter((c) => !c.knownDifference)
  const steps = CASE_PAGES.reduce((n, c) => n + c.steps.carapace, 0)
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 pt-14 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Verification</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Carapace against OpenSees</h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          Every problem below is built in PySees, solved in the browser by Carapace, exported as an OpenSeesPy script and solved again by real OpenSees. Every recorded value is compared at every step: displacements, support reactions, element forces and shell stress resultants, plus velocities and accelerations in dynamic analyses and frequencies and mode shapes in modal ones.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          The same comparisons run in the PySees test suite, so a change that breaks agreement fails before it ships. Each page links to the model, the exported script and the source that produced its numbers.
        </p>
        <Engines />
      </section>

      <section className="mx-auto mt-10 grid max-w-4xl gap-4 px-4 sm:grid-cols-3 md:px-6">
        {[[String(CASE_PAGES.length), 'problems, each run in both engines'], [sci(Math.max(...exact.map((c) => c.worst))), `largest relative difference over the ${exact.length} exact cases`], [steps.toLocaleString('en'), 'analysis steps compared']].map(([v, l]) => (
          <div key={l} className="rounded-lg border border-slate-200 p-4"><p className="text-2xl font-semibold text-slate-900">{v}</p><p className="mt-1 text-sm text-slate-600">{l}</p></div>
        ))}
      </section>

      <section className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How to read the numbers</h2>
        <p className="mt-3 leading-7 text-slate-700">
          For each quantity, the difference between the engines is taken at every step and every recorded value, and the largest one is divided by the largest value OpenSees recorded for that quantity. A case agrees when that ratio is below {sci(RTOL, 0)} for every quantity. Most cases agree to about 10⁻⁶, which is the precision of OpenSees' recorder output.
        </p>
        <p className="mt-3 leading-7 text-slate-700">
          A few cases are marked <em>known difference</em>. The two engines make a different, documented modelling choice there (for example how P-Delta or shell mass is formulated). Those pages explain the difference and give the tolerance the case is held to. They are listed rather than left out.
        </p>

        {CATEGORIES.map((cat) => {
          const cases = CASE_PAGES.filter((c) => c.category === cat.id)
          if (!cases.length) return null
          return (
            <div key={cat.id} className="mt-10">
              <h3 className="text-lg font-semibold text-slate-900">{cat.title}</h3>
              <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {cases.map((c) => (
                  <li key={c.id}>
                    <Link to={c.path} className="flex flex-col gap-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                      <img src={shot(c.id, 'result')} alt="" width={96} height={60} loading="lazy" className="hidden h-[60px] w-24 shrink-0 rounded border border-slate-200 object-cover sm:block" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{c.title}</span>
                        <span className="block text-sm text-slate-600">{c.description}</span>
                      </span>
                      <Badge c={c} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        <h2 className="mt-14 text-2xl font-semibold tracking-tight text-slate-900">Not verified, by design</h2>
        <ul className="mt-4 space-y-3">
          {NOT_VERIFIED.map(([t, d]) => <li key={t} className="leading-7 text-slate-700"><span className="font-semibold text-slate-900">{t}.</span> {d}</li>)}
        </ul>
        <p className="mt-4 leading-7 text-slate-700">Items Carapace does not support at all are reported as warnings when you run the model, never approximated silently. See <Link className="text-sky-700 underline" to="/docs/carapace/supported-features">Supported features</Link> and <Link className="text-sky-700 underline" to="/docs/carapace/differences">Differences from OpenSees</Link>.</p>
      </section>
    </>
  )
}

function Metrics({ data, c }: { data: CaseResult; c: VerificationCasePage }) {
  if (data.modal) {
    const m = data.modal
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Mode', 'Carapace ω (rad/s)', 'OpenSees ω (rad/s)', 'Relative difference'].map((h) => <th key={h} className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-900">{h}</th>)}</tr></thead>
          <tbody>{m.carapace.map((w, i) => <tr key={i}>{[i + 1, w, m.opensees[i], sci(Math.abs(w - m.opensees[i]) / m.opensees[i])].map((v, j) => <td key={j} className="border border-slate-200 px-3 py-2 font-mono text-slate-700">{v}</td>)}</tr>)}</tbody>
        </table>
        <p className="mt-2 text-sm text-slate-600">Mode shapes, every degree of freedom, each normalised by its largest component: largest difference {sci(m.shapeMaxAbs)}.</p>
      </div>
    )
  }
  const rows = Object.entries(data.metrics)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr>{['Quantity', 'Values compared', 'Largest OpenSees value', 'Largest difference', 'Relative'].map((h) => <th key={h} className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-900">{h}</th>)}</tr></thead>
        <tbody>{rows.map(([q, m]) => (
          <tr key={q}>
            <td className="border border-slate-200 px-3 py-2 text-slate-700">{QUANTITY[q] ?? q}</td>
            <td className="border border-slate-200 px-3 py-2 font-mono text-slate-700">{m!.compared} × {c.steps.carapace} steps</td>
            <td className="border border-slate-200 px-3 py-2 font-mono text-slate-700">{sci(m!.scale, 3)}</td>
            <td className="border border-slate-200 px-3 py-2 font-mono text-slate-700">{sci(m!.maxAbs, 2)}</td>
            <td className="border border-slate-200 px-3 py-2 font-mono text-slate-900">{sci(m!.maxRel)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function CasePage({ c }: { c: VerificationCasePage }) {
  const [data, setData] = useState<CaseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { loadCase(c.id).then(setData, (e: Error) => setError(e.message)) }, [c.id])
  const i = CASE_PAGES.indexOf(c), prev = CASE_PAGES[i - 1], next = CASE_PAGES[i + 1]
  return (
    <article className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <p className="text-sm text-slate-600"><Link to="/verification" className="text-sky-700 hover:underline">Verification</Link> · {categoryTitle(c.category)}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{c.title}</h1>
      <p className="mt-2 text-lg text-slate-600">{c.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge c={c} />
        {c.features.map((f) => <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{f}</span>)}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(['model', 'result'] as const).map((k) => (
          <figure key={k}>
            <img src={shot(c.id, k)} alt={`${c.title}: ${k === 'model' ? 'the model in PySees' : 'the Carapace result in PySees'}`} width={825} height={766} className="w-full rounded-lg border border-slate-200" loading={k === 'model' ? 'eager' : 'lazy'} />
            <figcaption className="mt-1 text-xs text-slate-500">{k === 'model' ? 'The model in PySees' : 'Carapace result, last step'}</figcaption>
          </figure>
        ))}
      </div>

      <Markdown>{c.body}</Markdown>

      {c.rtol.why && (
        <aside className="my-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-2 font-semibold"><Info className="h-4 w-4" />Known difference: held to {Number((c.rtol.value * 100).toPrecision(2))}%{c.rtol.quantities ? ` for ${c.rtol.quantities.map((q) => (QUANTITY[q] ?? q).toLowerCase()).join(', ')}` : ''} instead of {sci(RTOL, 0)}</p>
          <p className="leading-6">{c.rtol.why}</p>
        </aside>
      )}

      <h2 className="mt-10 mb-3 border-b border-slate-200 pb-2 text-xl font-semibold tracking-tight text-slate-900">Results</h2>
      {error && <p className="text-sm text-red-700">Could not load the results: {error}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Loading results…</p>}
      {data && (
        <div className="space-y-6">
          <Suspense fallback={<p className="text-sm text-slate-500">Loading plots…</p>}>
            <div className="grid gap-4 lg:grid-cols-2">{data.plots.map((p) => <CasePlot key={p.title} plot={p} />)}</div>
          </Suspense>
          <Metrics data={data} c={c} />
          {data.skip.length > 0 && <ul className="text-sm text-slate-600">{data.skip.map((s) => <li key={s.quantity}><span className="font-medium">{QUANTITY[s.quantity] ?? s.quantity} not compared:</span> {s.why}</li>)}</ul>}
        </div>
      )}

      <h2 className="mt-10 mb-3 border-b border-slate-200 pb-2 text-xl font-semibold tracking-tight text-slate-900">Try it, check it</h2>
      <div className="flex flex-wrap gap-3">
        <Button nativeButton={false} render={<a href={`/studio?open=/verification/${c.id}.pysees.py`}><Play className="h-4 w-4" />Open in PySees</a>} />
        <Button variant="outline" nativeButton={false} render={<a href={`/verification/${c.id}.py`} download><Download className="h-4 w-4" />OpenSeesPy script</a>} />
        <Button variant="outline" nativeButton={false} render={<a href={sourceUrl(c)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Case definition</a>} />
      </div>
      <p className="mt-4 text-sm text-slate-600">Carapace source for what this case exercises: {c.sources.map((s, k) => <span key={s}>{k > 0 && ', '}<a className="font-mono text-sky-700 underline" href={carapaceUrl(s)} target="_blank" rel="noreferrer">{s.split('/').pop()}</a></span>)}</p>

      <div className="mt-12 grid grid-cols-2 gap-4 border-t pt-6 text-sm">
        {prev ? <Link to={prev.path} className="flex items-center gap-1 text-slate-600 hover:text-slate-900"><ChevronLeft className="h-4 w-4" />{prev.title}</Link> : <span />}
        {next ? <Link to={next.path} className="flex items-center justify-end gap-1 text-slate-600 hover:text-slate-900">{next.title}<ChevronRight className="h-4 w-4" /></Link> : <span />}
      </div>
    </article>
  )
}

export function VerificationPage() {
  const { id } = useParams()
  const c = findCase(id)
  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-white outline-none">
      <MarketingHeader currentPath="/verification" />
      {!id ? <IndexPage /> : c ? <CasePage key={c.id} c={c} /> : (
        <article className="mx-auto max-w-4xl px-4 py-14 md:px-6"><h1 className="text-2xl font-semibold">Case not found</h1><p className="mt-2 text-slate-600">There is no verification case called “{id}”. <Link className="text-sky-700 underline" to="/verification">See all cases</Link>.</p></article>
      )}
      <LandingFooter />
    </main>
  )
}
