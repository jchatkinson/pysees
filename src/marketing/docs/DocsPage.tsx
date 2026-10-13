import { useState } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'
import { LandingFooter } from '@/marketing/components/LandingFooter'
import { DocsSearch } from './DocsSearch'
import { Markdown } from './Markdown'
import { FLAT, TREE, categoryTitle, findPage } from './content'

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation" className="space-y-6 text-sm">
      {TREE.map(c => (
        <div key={c.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{c.title}</h3>
          <ul className="space-y-0.5 border-l border-slate-200">
            {c.pages.map(p => (
              <li key={p.path}>
                <NavLink to={p.path} onClick={onNavigate} className={({ isActive }) => `-ml-px block border-l py-1 pl-3 ${isActive ? 'border-sky-600 font-medium text-sky-700' : 'border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900'}`}>{p.title}</NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function DocsPage() {
  const { category, slug } = useParams()
  const page = findPage(category, slug)
  const [menu, setMenu] = useState(false)
  if (!category && FLAT[0]) return <Navigate to={FLAT[0].path} replace />
  const i = page ? FLAT.indexOf(page) : -1
  const prev = FLAT[i - 1], next = FLAT[i + 1]

  return (
    <main id="main" tabIndex={-1} className="outline-none min-h-screen bg-white">
      <MarketingHeader currentPath="/docs" />
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="flex items-center gap-2 border-b py-3 md:hidden">
          <button type="button" aria-label="Toggle docs menu" aria-expanded={menu} onClick={() => setMenu(m => !m)} className="grid h-9 w-9 place-items-center rounded-md border">{menu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
          <DocsSearch />
        </div>
        {menu && <div className="max-h-[70vh] overflow-y-auto border-b py-4 md:hidden"><Sidebar onNavigate={() => setMenu(false)} /></div>}
        <div className="grid gap-10 py-8 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[14rem_minmax(0,1fr)_12rem]">
          <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto overflow-x-hidden md:block">
            <div className="mb-4 flex"><DocsSearch /></div>
            <Sidebar />
          </aside>
          {page ? (
            <article className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">{categoryTitle(page.category)}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{page.title}</h1>
              {page.description && <p className="mt-2 text-lg text-slate-600">{page.description}</p>}
              <Markdown>{page.body}</Markdown>
              <div className="mt-12 grid grid-cols-2 gap-4 border-t pt-6 text-sm">
                {prev ? <Link to={prev.path} className="flex items-center gap-1 text-slate-600 hover:text-slate-900"><ChevronLeft className="h-4 w-4" />{prev.title}</Link> : <span />}
                {next ? <Link to={next.path} className="flex items-center justify-end gap-1 text-slate-600 hover:text-slate-900">{next.title}<ChevronRight className="h-4 w-4" /></Link> : <span />}
              </div>
            </article>
          ) : (
            <article><h1 className="text-2xl font-semibold">Page not found</h1><p className="mt-2 text-slate-600">That docs page doesn’t exist. Pick a topic from the sidebar or search.</p></article>
          )}
          {page && (
            <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto text-sm lg:block">
              {page.headings.length > 0 && (
                <>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">On this page</h2>
                  <ul className="space-y-1">
                    {page.headings.map(h => <li key={h.id} className={h.level === 3 ? 'pl-3' : ''}><a href={`#${h.id}`} className="text-slate-600 hover:text-slate-900">{h.text}</a></li>)}
                  </ul>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
      <LandingFooter />
    </main>
  )
}
