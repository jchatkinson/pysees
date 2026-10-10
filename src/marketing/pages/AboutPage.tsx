import { Link } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'
import about1 from '@/marketing/assets/about1.png'

export function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <MarketingHeader currentPath="/about" />

      <section className="mx-auto max-w-4xl px-4 pt-14 text-center md:px-6 md:pt-18">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl">Our Mission & Values</h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-600">
          PySees lowers the barrier to structural analysis by pairing a visual, parametric modeling experience with an in-browser solver and OpenSeesPy export.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:px-6 md:pt-16">
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-slate-900">We help teams build structural analysis workflows faster</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            PySees is a web-based GUI for building, running and postprocessing structural models. Analysis runs in your browser, and models export to OpenSeesPy scripts you can run yourself.
          </p>

          <Tabs defaultValue="mission" className="mt-16">
            <TabsList variant="line" className="gap-8 pl-0">
              <TabsTrigger className="!h-auto !px-0 !py-0 pr-5 !text-4xl !font-semibold tracking-tight text-slate-900" value="mission">Mission</TabsTrigger>
              <TabsTrigger className="!h-auto !px-0 !py-0 pr-5 !text-4xl !font-semibold tracking-tight text-slate-900" value="approach">Approach</TabsTrigger>
              <TabsTrigger className="!h-auto !px-0 !py-0 !text-4xl !font-semibold tracking-tight text-slate-900" value="value">Values</TabsTrigger>
            </TabsList>
            <TabsContent value="mission" className="mt-5 space-y-4 text-lg leading-relaxed text-slate-600">
              <p>Our mission is to make nonlinear structural analysis, and OpenSeesPy, accessible to more engineers, students, and researchers by reducing setup friction and coding overhead at project start.</p>
              <p>We aim to bridge traditional structural workflows with a modern parametric interface that remains faithful to OpenSees fundamentals.</p>
            </TabsContent>
            <TabsContent value="approach" className="mt-5 space-y-4 text-lg leading-relaxed text-slate-600">
              <p>PySees treats the model as the single source of truth. Nodes, materials, sections, elements, loads and an authored analysis sequence are stored as typed entities, and everything else is derived from them: the 3D viewport, the solver input, and the exported script.</p>
              <p>Model creation happens through schema-driven forms that map directly to OpenSees commands, so the GUI stays aligned with the OpenSees API and scripts can be imported back in.</p>
              <p>Analyses run in your browser, with results streamed into local storage and read back step by step for deformed shapes, force diagrams, contours and plots. Editing the model discards stale results, so what you see always matches what you built.</p>
              <p>The in-browser solver, <Link to="/carapace" className="underline">Carapace</Link>, is checked against real OpenSees on shared models, and the OpenSeesPy export lets you run any model in OpenSees yourself.</p>
            </TabsContent>
            <TabsContent value="value" className="mt-5 space-y-4 text-lg leading-relaxed text-slate-600">
              <p><span className="font-semibold text-slate-900">Transparency.</span> PySees does not attempt to hide OpenSees behind a graphical abstraction. Models built in the interface map directly to readable OpenSeesPy code so users can see exactly what commands are being generated.</p>
              <p><span className="font-semibold text-slate-900">Learning-oriented tools.</span> The interface is designed to help users understand OpenSees rather than replace it. PySees acts as a bridge between traditional structural analysis workflows and the scripting-based OpenSees environment.</p>
              <p><span className="font-semibold text-slate-900">Reproducibility.</span> Scene rendering, solver input and script export are all derived from the same model, and the solver is cross-checked against OpenSees, making results easier to reproduce, debug, and share.</p>
              <p><span className="font-semibold text-slate-900">Control and flexibility.</span> PySees reduces repetitive setup work while preserving the full flexibility of OpenSees through exported Python scripts that can be edited or extended outside the GUI.</p>
              <p><span className="font-semibold text-slate-900">Accessibility.</span> The project aims to lower the barrier to entry for nonlinear structural analysis while remaining useful for advanced users working on research-scale models.</p>
            </TabsContent>
          </Tabs>
        </div>

        <div className="relative">
          <img src={about1} alt="PySees about visual" className="h-full max-h-[500px] w-full rounded-3xl object-cover" />
        </div>
      </section>
    </main>
  )
}
