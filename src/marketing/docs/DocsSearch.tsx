import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/app/components/ui/dialog'
import { search } from './search'

/** Header button + Ctrl/Cmd+K dialog. Arrow keys move, Enter opens. */
export function DocsSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const hits = useMemo(() => search(q), [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (href: string) => { setOpen(false); setQ(''); nav(href) }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500 hover:border-slate-300">
        <Search className="h-4 w-4" /><span className="flex-1 truncate text-left">Search docs</span><kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 text-[10px] md:inline">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setQ('') }}>
        <DialogContent showCloseButton={false} className="top-24 -translate-y-0 gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Search docs</DialogTitle>
          <DialogDescription className="sr-only">Search the PySees documentation</DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input autoFocus value={q} placeholder="Search the docs…" className="h-11 flex-1 bg-transparent text-sm outline-none"
              onChange={e => { setQ(e.target.value); setSel(0) }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, hits.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
                else if (e.key === 'Enter' && hits[sel]) go(hits[sel].href)
              }} />
          </div>
          <ul className="max-h-96 overflow-y-auto p-2">
            {q && !hits.length && <li className="px-3 py-6 text-center text-sm text-slate-500">No results for “{q}”</li>}
            {hits.map((h, i) => (
              <li key={h.key}>
                <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(h.href)} className={`block w-full rounded-md px-3 py-2 text-left ${i === sel ? 'bg-sky-50' : ''}`}>
                  <span className="block text-sm font-medium text-slate-900">{h.page.title}{h.heading && <span className="font-normal text-slate-500"> › {h.heading}</span>}</span>
                  <span className="block text-[11px] uppercase tracking-wide text-sky-700">{h.category}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{h.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
