import type { ReactNode } from 'react'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
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
    version: 'v0.8.0',
    date: 'November 25, 2026',
    title: 'Light-Frame Wood',
    subtitle: 'Stud walls, joist floors and diaphragms, drawn over the drawing set.',
    content: (
      <>
        <p>PySees now models wood-frame buildings in the built-in solver. Draw stud walls in a story plan with their lumber framing, openings, headers and sheathing; each pier end is held down to whatever is below it. Joist floors take area loads down to the walls and beams under them, overhangs included, and diaphragms tie each level together.</p>
        <p>Trace over PDF drawing sheets placed under each plan, then walk through the result with the new fly mode. The BC Rowhouse template, a two-unit rowhouse from a real drawing set, shows it all together.</p>
      </>
    ),
    new: [
      'Stud walls: lumber framing (CSA O86 / NDS), openings with headers, O86 sheathing, hold-downs, wall loads',
      'Joist floors of any outline, bearing on stud walls and beams, with a load takedown table',
      'Rigid and flexible diaphragms assigned per level from the selection',
      'Stud-wall results: pier chord forces and the axial force in every stud, post, jack and cripple',
      'PDF underlays: import sheets at their printed scale, calibrate, align and crop',
      'BC Rowhouse and Grid only templates',
      'Fly mode (Shift+F): move through the model with W A S D and look around with the mouse',
      'Extruded view of wall framing and floor joists',
    ],
    updates: [
      'Labels (grid bubbles, levels, IDs, values, reactions) are drawn in the scene, hidden behind the model, and stay fast with thousands of them',
      'Beams and joists in the extruded view hang from their top face, and elastic members show their real proportions',
      'Grid and level lines are crisp at any zoom',
      'Documentation for the ribbon, views, drawing and editing tools, stud walls, joist floors and underlays, with new screenshots',
      'The New Model dialog fits any window: the templates and long forms scroll, and the buttons stay in view',
    ],
    bugs: [
      'Several nodal loads on the same node and direction now add up instead of the last one replacing the others',
      'Joist floors with notched outlines no longer lose a sliver of load at the corners',
      'Grid and level lines no longer flicker against floors in the same plane',
      'Grid only: story heights given in other units (12 ft in a kip-in model) no longer show rounding noise',
      'The joist floor card counts the strips that bear on beams',
    ],
  },
  {
    version: 'v0.7.0',
    date: 'November 24, 2026',
    title: 'Drawing and Editing',
    subtitle: 'A ribbon toolbar, story plans and elevations, and tools to draw and edit in the viewport.',
    content: (
      <>
        <p>Studio has a new ribbon in place of the menus, with a command palette (Ctrl+K) to find any command. Look at a model in 3D, one story at a time in plan, or along a grid line in elevation, and draw members, beams, columns, shells and supports directly on the grids.</p>
        <p>Move, copy, mirror, divide and merge what you select, reassign properties and supports from the selection panel, and switch on the extruded view to see members at their section shape. Multi-point constraints now run in the built-in solver, and large models draw and record much faster.</p>
      </>
    ),
    new: [
      'Ribbon toolbar and command palette',
      'Story plan and grid elevation views, with the story above shown as outlines',
      'Drawing tools: frame members (with typed lengths), quick beams and columns, shells, supports, on every story at once',
      'Move, copy, mirror, divide and merge; assign nodal and member loads; isolate the selection',
      'Extruded view of member sections and shell thickness',
      'Support reactions in the results viewport',
      'Precast Wall template with zero-length connectors and Coulomb friction',
      'Shell stiffness modifiers for cracked slabs and walls',
      'Tower template for large models',
    ],
    updates: [
      'Multi-point constraints (equalDOF, rigidLink, rigidDiaphragm) run in the built-in solver',
      'Faster drawing and recording for large models',
    ],
    bugs: ['Fixed running out of memory after a large run', 'Fiber sections not drawn about their centroid now respond as in OpenSees'],
  },
  {
    version: 'v0.6.0',
    date: 'October 12, 2026',
    title: 'Projects and Docs',
    subtitle: 'Save and reopen whole projects, and read the documentation.',
    content: (
      <>
        <p>Projects save as an annotated OpenSeesPy script: run it in OpenSees as is, or open it in PySees to get the whole project back, including the analysis, grids, levels and saved plots.</p>
        <p>The new documentation covers building a model, running analyses and reading results.</p>
      </>
    ),
    new: ['Save and open projects as annotated .py scripts', 'Documentation site with search', 'AISC shapes and steel and concrete fiber section templates', 'Earthquake analysis block with Rayleigh damping'],
    updates: ['Results show their maximum and minimum', 'More uniaxial materials wired to the solver'],
    bugs: ['Fixed result storage for every analysis case'],
  },
  {
    version: 'v0.5.0',
    date: 'October 9, 2026',
    title: '3D Models and Shells',
    subtitle: 'Model and review 3D frames and shell structures.',
    content: (
      <>
        <p>PySees now handles 3D models (Z-up) alongside 2D, including 4- and 3-node shell elements with nodal, self-weight and pressure loads.</p>
        <p>Beam local axes follow the OpenSees vecxz rule, and loads, deformed shapes and force diagrams all use them. Shell stress resultants are drawn as contours.</p>
      </>
    ),
    new: ['3D models with ShellMITC4 and ShellDKGT elements', '3D force diagrams (Vy/Vz, Mz/My, torque) in member local axes', 'Shell stress contours in the results viewport', 'Click to select elements in the scene', '3D starter template'],
    updates: [],
    bugs: [],
  },
  {
    version: 'v0.4.0',
    date: 'October 6, 2026',
    title: 'Analysis in the Browser',
    subtitle: 'Run models in the browser, view results, and move scripts in and out.',
    content: (
      <>
        <p>Models now analyze directly in your browser with a built-in solver (see <Link to="/carapace" className="underline">Carapace</Link>). Runs happen in a background worker and results are stored locally, so there is no server and no local OpenSees install.</p>
        <p>Scripts round trip: export OpenSeesPy (or import an existing script) and compare, since the solver is tested against real OpenSees on shared models.</p>
      </>
    ),
    new: ['In-browser static (including pushover), eigen and transient analysis', 'Deformed shape, animation and element force diagrams', 'Plot overlay, filterable data tables and saved Report plots', 'Analysis blocks with drag-and-drop ordering and multiple load cases', 'Import OpenSeesPy and Tcl scripts into the editor', 'Fiber section preview and editor'],
    updates: ['Retired the local agent; no local OpenSees connection is needed anymore', 'Removed recorder-file import in favor of in-browser results'],
    bugs: [],
  },
  {
    version: 'v0.3.0',
    date: 'March 9, 2026',
    title: 'Live Material Previews',
    subtitle: 'Chart the response of a uniaxial material under a load protocol.',
    content: (
      <>
        <p>Added a dedicated Material Preview overlay for uniaxial materials. Generate a simple load protocol or use your own, and chart the response of your material definition.</p>
        <p>The preview now runs entirely in the browser on the built-in solver, so there is nothing to install.</p>
      </>
    ),
    new: ['Material Preview panel that runs in the browser', 'Load Protocol builder: monotonic, cyclic, and custom strain lists', 'Hysteresis replay controls: Animate and scrub slider to investigate material hysteresis.'],
    updates: [],
    bugs: [],
  },
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
          {item.new.length > 0 && <ChangeGroup label="New" items={item.new} tone="green" />}
          {item.updates.length > 0 && <ChangeGroup label="Updates" items={item.updates} tone="blue" />}
          {item.bugs.length > 0 && <ChangeGroup label="Bug Fixes" items={item.bugs} tone="amber" />}
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
            <Button size="lg" render={<Link to="/studio">Open Studio</Link>} />
          </div>
        </div>
        <div className="relative mt-12">
          {CHANGELOG_ITEMS.map((item) => <TimelineItem key={`${item.version}-${item.title}`} item={item} />)}
        </div>
      </div>
    </section>
  )
}
