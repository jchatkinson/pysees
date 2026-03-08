import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MarketingHeader } from '@/components/MarketingHeader'

export function ContactPage() {
  return (
    <main className="min-h-screen bg-white">
      <MarketingHeader currentPath="/contact" />

      <section className="mx-auto max-w-4xl px-4 pt-14 text-center md:px-6 md:pt-18">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl">Contact Us</h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-600">
          Questions, feedback, or feature requests for PySees? Send a message and we will follow up.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:px-6 md:pt-16">
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-slate-900">Let’s build better analysis workflows</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            PySees focuses on practical OpenSees model authoring and postprocessing UX. If you are using it in coursework, research, or practice, we want to hear where it helps and where it still gets in your way.
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

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <form className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm text-slate-700" htmlFor="contact-name">Name</Label>
              <Input id="contact-name" placeholder="Your name" className="h-10 bg-white text-sm md:text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-slate-700" htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" placeholder="you@example.com" className="h-10 bg-white text-sm md:text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-slate-700" htmlFor="contact-topic">Topic</Label>
              <Input id="contact-topic" placeholder="Feature request, bug report, question..." className="h-10 bg-white text-sm md:text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-slate-700" htmlFor="contact-message">Message</Label>
              <Textarea id="contact-message" placeholder="Write your message..." className="min-h-36 resize-y bg-white text-sm md:text-sm" />
            </div>
            <Button type="button" size="lg" className="w-full">Send Message</Button>
            <p className="text-xs text-slate-500">Form wiring is pending. This is a visual scaffold only.</p>
          </form>
        </div>
      </section>
    </main>
  )
}
