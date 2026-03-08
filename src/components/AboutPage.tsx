import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MarketingHeader } from '@/components/MarketingHeader'
import about1 from '@/assets/about1.png'

export function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <MarketingHeader currentPath="/about" />

      <section className="mx-auto max-w-4xl px-4 pt-14 text-center md:px-6 md:pt-18">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl">Our Mission & Values</h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-600">
          PySees lowers the barrier to OpenSees by turning command-first workflows into a visual, history-driven modeling experience.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:px-6 md:pt-16">
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-slate-900">We help teams build structural analysis workflows faster</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            PySees is a web-based GUI preprocessor/postprocessor for OpenSeesPy models. It does not run OpenSees in-browser; instead it focuses on deterministic model authoring, script export, and results import.
          </p>

          <Tabs defaultValue="mission" className="mt-16">
            <TabsList variant="line" className="gap-8 pl-0">
              <TabsTrigger className="!h-auto !px-0 !py-0 pr-5 !text-4xl !font-semibold tracking-tight text-slate-900" value="mission">Mission</TabsTrigger>
              <TabsTrigger className="!h-auto !px-0 !py-0 pr-5 !text-4xl !font-semibold tracking-tight text-slate-900" value="approach">Approach</TabsTrigger>
              <TabsTrigger className="!h-auto !px-0 !py-0 !text-4xl !font-semibold tracking-tight text-slate-900" value="value">Values</TabsTrigger>
            </TabsList>
            <TabsContent value="mission" className="mt-5 space-y-4 text-lg leading-relaxed text-slate-600">
              <p>Our mission is to make OpenSeesPy accessible to more engineers, students, and researchers by reducing setup friction and coding overhead at project start.</p>
              <p>We aim to bridge traditional structural workflows with a modern parametric interface that remains faithful to OpenSees fundamentals.</p>
            </TabsContent>
            <TabsContent value="approach" className="mt-5 space-y-4 text-lg leading-relaxed text-slate-600">
              <p>PySees treats structural models as a sequence of commands rather than as an opaque graphical state.</p>
              <p>The core model is defined by an immutable command history. Each command represents an OpenSees modeling instruction. The current model state, scene representation, and exported Python script are derived by replaying this history.</p>
              <p>This architecture enables undo/redo, deterministic model reconstruction, and reliable script generation.</p>
              <p>Model creation happens through schema-driven command forms that map directly to OpenSees commands. This ensures the GUI remains aligned with the underlying OpenSees API.</p>
              <p>The application focuses on model preparation and visualization rather than analysis execution. Users export a Python script that runs using OpenSeesPy on their local machine. Recorder files generated from that analysis can then be imported back into the interface for lightweight postprocessing and visualization.</p>
              <p>By separating modeling, analysis execution, and visualization, PySees maintains a simple architecture while remaining compatible with the full OpenSees ecosystem.</p>
            </TabsContent>
            <TabsContent value="value" className="mt-5 space-y-4 text-lg leading-relaxed text-slate-600">
              <p><span className="font-semibold text-slate-900">Transparency.</span> PySees does not attempt to hide OpenSees behind a graphical abstraction. Models built in the interface map directly to readable Python code so users can see exactly what commands are being generated.</p>
              <p><span className="font-semibold text-slate-900">Learning-oriented tools.</span> The interface is designed to help users understand OpenSees rather than replace it. PySees acts as a bridge between traditional structural analysis workflows and the scripting-based OpenSees environment.</p>
              <p><span className="font-semibold text-slate-900">Reproducibility.</span> Model definitions are derived entirely from command history. Scene rendering, script export, and model state are deterministic results of that history, making models easier to reproduce, debug, and share.</p>
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
