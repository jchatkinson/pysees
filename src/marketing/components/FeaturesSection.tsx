import { CheckCircle2 } from 'lucide-react'
import hero1 from '@/marketing/assets/hero1.png'
const materialPreviewGif = '/material_preview.gif'

type FeatureGroup = {
  eyebrow: string
  title: string
  description: string
  items: { title: string; detail: string }[]
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    eyebrow: 'OUR BEST FEATURES',
    title: 'Model, analyze and review in one place, with nothing to install',
    description: 'Every form maps to an OpenSees command, and the model runs in your browser, so a change is a few clicks from new results.',
    items: [
      { title: 'In-Browser Analysis', detail: 'A built-in solver runs your model in a background worker, with no server and no local install. It is checked against OpenSees on the same models.' },
      { title: '2D and 3D Models', detail: 'Elastic and fiber-section beam-columns, trusses and MITC4/DKGT shells, with nodal, element, self-weight and pressure loads.' },
      { title: 'Live Material Preview', detail: 'Drive any uniaxial material through a monotonic, cyclic or custom strain protocol and watch the hysteresis, with a fiber section editor alongside.' },
    ],
  },
  {
    eyebrow: 'RESULTS AND INTEROP',
    title: 'Understand the response, then take the model anywhere',
    description: 'Results are stored in your browser and read step by step, so large analyses stay responsive.',
    items: [
      { title: 'Results Viewing', detail: 'Animated deformed shapes, shear/moment/torsion/axial diagrams in the members’ local axes, shell stress contours and step playback.' },
      { title: 'Plots, Tables and Reports', detail: 'Chart any recorded response, filter and sort data tables, and save plots to a report that regenerates when the model re-runs.' },
      { title: 'OpenSeesPy and Tcl Round Trip', detail: 'Export readable OpenSeesPy scripts, or import an existing OpenSeesPy or Tcl script into the editor.' },
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
            <img src={materialPreviewGif} alt="PySees feature preview" className="h-full w-full rounded-md object-cover object-top" />
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
