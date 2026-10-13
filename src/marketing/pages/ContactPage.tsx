import { Button } from '@/app/components/ui/button'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'

const ISSUES = 'https://github.com/jchatkinson/pysees/issues'

export function ContactPage() {
  return (
    <main id="main" tabIndex={-1} className="outline-none min-h-screen bg-white">
      <MarketingHeader currentPath="/contact" />

      <section className="mx-auto max-w-4xl px-4 pt-14 text-center md:px-6 md:pt-18">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl">Contact Us</h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-600">
          Questions, feedback, or feature requests for PySees? Open an issue on GitHub and we will follow up there.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:px-6 md:pt-16">
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-slate-900">Let’s build better analysis workflows</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            PySees focuses on practical structural model authoring, analysis and postprocessing UX. If you are using it in coursework, research, or practice, we want to hear where it helps and where it still gets in your way.
          </p>
          <div className="mt-10 space-y-6 text-lg leading-relaxed text-slate-600">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">General Inquiries</h3>
              <p className="mt-2">Questions about the product direction, roadmap, or usage approach.</p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Feature Requests</h3>
              <p className="mt-2">Tell us what commands, workflows, or visualization tools you need next.</p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Bug Reports</h3>
              <p className="mt-2">Share issues with reproducible steps so we can debug quickly.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="mx-auto size-20 fill-slate-900"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
          <h3 className="mt-5 text-center text-2xl font-semibold text-slate-900">Open an issue on GitHub</h3>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Questions, bug reports, and feature requests all live in the PySees issue tracker. Search existing issues first, then open a new one if yours is not there.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button size="lg" className="w-full" render={<a href={`${ISSUES}/new`} target="_blank" rel="noopener noreferrer" />}>New issue</Button>
            <Button size="lg" variant="outline" className="w-full" render={<a href={ISSUES} target="_blank" rel="noopener noreferrer" />}>Browse existing issues</Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">A free GitHub account is required. For bugs, include the steps to reproduce and, if possible, the saved .py project.</p>
        </div>
      </section>
    </main>
  )
}
