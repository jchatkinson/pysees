import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'

type ChangelogItem = {
  version: string
  date: string
  title: string
  subtitle: string
  content: ReactNode
  new: string[]
  updates: string[]
  bugs: string[]
}

const CHANGELOG_ITEMS: ChangelogItem[] = [
  {
    version: 'v0.2.0',
    date: 'March 8, 2026',
    title: 'Landing + Route Split',
    subtitle: 'New marketing route structure with dedicated studio entry point.',
    content: (
      <>
        <p>The base route now serves a landing page and the modeling app runs at <code>/studio</code>.</p>
        <p>Navigation scaffolds are in place for feature storytelling and change visibility.</p>
      </>
    ),
    new: ['Dedicated landing page at /', 'Studio route moved to /studio', 'Scaffold routes: /about, /contact, /signup, /login'],
    updates: ['Hero section uses real app screenshots', 'Top navigation includes Features, Change Log, About, Contact'],
    bugs: ['Fixed route fallthrough issue for scaffold pages'],
  },
  {
    version: 'v0.1.0',
    date: 'March 7, 2026',
    title: 'V1 Pipeline Scaffold',
    subtitle: 'Command-history-driven model state and app shell scaffolding.',
    content: (
      <>
        <p>Initial app shell and model editing flow were scaffolded for end-to-end iteration.</p>
        <p>Core focus remains command replay, export-ready script generation, and viewport parity.</p>
      </>
    ),
    new: ['App shell with model workspace layout', 'History-oriented modeling flow scaffolds', 'Initial command form and viewport integration'],
    updates: ['State/replay foundations for deterministic model rebuilds', 'UI structure aligned with TopBar, HistoryPanel, CommandForm, ActionBar'],
    bugs: ['Early layout/interaction edge cases still under active hardening'],
  },
]

function ChangeGroup({ label, items, tone }: { label: string; items: string[]; tone: 'green' | 'blue' | 'amber' }) {
  const color = tone === 'green' ? 'bg-green-100 text-green-700' : tone === 'blue' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
  return (
    <details open className="group rounded-xl border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5">
        <Badge className={`border-0 ${color}`}>{label}</Badge>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="list-disc space-y-2 px-8 pb-4 text-sm text-slate-600 marker:text-slate-400">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </details>
  )
}

function TimelineItem({ item }: { item: ChangelogItem }) {
  return (
    <article className="relative flex justify-end gap-2 pb-10">
      <aside className="hidden w-36 shrink-0 flex-col items-end gap-2 pt-1 text-right text-xs text-slate-500 md:sticky md:top-20 md:flex md:self-start">
        <Badge className="h-6 rounded-md bg-slate-900 px-2 text-[11px] font-semibold text-white">{item.version}</Badge>
        <p>{item.date}</p>
      </aside>
      <div className="hidden w-5 flex-col items-center md:flex">
        <span className="sticky top-20 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-300 bg-slate-100 shadow-[0_0_0_2px_white]">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
        </span>
        <span className="w-px flex-1 bg-slate-300" />
      </div>
      <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <Badge className="h-6 rounded-md bg-slate-900 px-2 text-[11px] font-semibold text-white">{item.version}</Badge>
          <p className="text-xs text-slate-500">{item.date}</p>
        </div>
        <h3 className="text-xl font-semibold tracking-tight text-slate-900">{item.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{item.subtitle}</p>
        <div className="mt-4 space-y-2 text-sm text-slate-600">{item.content}</div>
        <div className="mt-5 space-y-3">
          <ChangeGroup label="New" items={item.new} tone="green" />
          <ChangeGroup label="Updates" items={item.updates} tone="blue" />
          <ChangeGroup label="Bug Fixes" items={item.bugs} tone="amber" />
        </div>
      </div>
    </article>
  )
}

export function ChangelogSection() {
  return (
    <section id="changelog" className="border-t bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline">Updates</Badge>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Changelog</h2>
          <p className="mt-3 text-sm text-slate-600">See what is shipping in PySees as modeling and results workflows evolve.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <input type="email" placeholder="Your email" className="h-8 w-56 rounded-md border border-slate-300 bg-white px-3 text-sm" />
            <Button asChild size="lg">
              <Link to="/signup">Sign up</Link>
            </Button>
          </div>
        </div>
        <div className="relative mt-12">
          {CHANGELOG_ITEMS.map((item) => <TimelineItem key={`${item.version}-${item.title}`} item={item} />)}
        </div>
      </div>
    </section>
  )
}
