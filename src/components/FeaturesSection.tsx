import { CheckCircle2 } from 'lucide-react'
import hero1 from '@/assets/hero1.png'

type FeatureGroup = {
  eyebrow: string
  title: string
  description: string
  items: { title: string; detail: string }[]
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    eyebrow: 'OUR BEST FEATURES',
    title: 'Build OpenSeesPy models faster without losing technical clarity',
    description: 'PySees combines visual modeling with deterministic command history to keep workflows efficient and reproducible.',
    items: [
      { title: 'History-Driven Modeling', detail: 'Every edit is tracked as immutable commands with reliable undo/redo and replay-based state reconstruction.' },
      { title: 'Schema-Driven Command Forms', detail: 'Command entry maps directly to OpenSees semantics, reducing invalid setup and manual argument errors.' },
      { title: 'Python Export Pipeline', detail: 'Generate readable OpenSeesPy scripts that can be executed, inspected, and extended outside the GUI.' },
    ],
  },
  {
    eyebrow: 'ADVANCED FEATURES',
    title: 'Scale repetitive workflows with scripting and focused postprocessing',
    description: 'Use structured automation and lightweight results visualization to iterate on analysis models quickly.',
    items: [
      { title: 'Script-Assisted Generation', detail: 'Use worker-based scripting to emit repeatable geometry and loading patterns as grouped commands.' },
      { title: 'Deterministic Reproducibility', detail: 'Scene rendering, exported scripts, and model state all derive from the same command timeline.' },
      { title: 'Results Import Loop', detail: 'Bring recorder outputs back into the app for deformed-shape and response-focused visualization workflows.' },
    ],
  },
]

function FeatureList({ items }: { items: FeatureGroup['items'] }) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item) => (
        <li key={item.title} className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
          <p className="text-lg leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-900">{item.title}:</span> {item.detail}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function FeaturesSection() {
  return (
    <section id="features" className="border-t bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-18">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600">{FEATURE_GROUPS[0].eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:text-4xl">{FEATURE_GROUPS[0].title}</h2>
            <p className="mt-5 text-2xl leading-relaxed text-slate-600">{FEATURE_GROUPS[0].description}</p>
            <FeatureList items={FEATURE_GROUPS[0].items} />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
            <img src={hero1} alt="PySees feature preview" className="h-full w-full rounded-md object-cover object-top" />
          </div>
        </div>

        <div className="mt-14 grid items-center gap-10 md:grid-cols-2">
          <div className="order-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4 md:order-1">
            <img src={hero1} alt="PySees advanced feature preview" className="h-full w-full rounded-md object-cover object-top" />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600">{FEATURE_GROUPS[1].eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:text-4xl">{FEATURE_GROUPS[1].title}</h2>
            <p className="mt-5 text-2xl leading-relaxed text-slate-600">{FEATURE_GROUPS[1].description}</p>
            <FeatureList items={FEATURE_GROUPS[1].items} />
          </div>
        </div>
      </div>
    </section>
  )
}
