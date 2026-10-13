import MiniSearch from 'minisearch'
import { PAGES, categoryTitle, type DocPage } from './content'

interface Entry { id: string; page: DocPage; title: string; heading: string; anchor: string; text: string; keywords: string }

const strip = (s: string) => s.replace(/```[\s\S]*?```/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_>|#]/g, ' ').replace(/\s+/g, ' ').trim()

/** One entry per page section (split on h2/h3) so hits can deep-link to a heading. */
export function buildEntries(pages: DocPage[]): Entry[] {
  const out: Entry[] = []
  for (const page of pages) {
    const parts = page.body.split(/^(?=#{2,3}\s)/m)
    let h = 0
    parts.forEach((part, i) => {
      const hm = /^#{2,3}\s+(.+)/.exec(part)
      const heading = hm ? hm[1].replace(/[`*_]/g, '') : ''
      const anchor = hm ? page.headings[h++]?.id ?? '' : ''
      out.push({ id: `${page.path}#${i}`, page, title: page.title, heading, anchor, text: strip(hm ? part.slice(hm[0].length) : part), keywords: page.keywords })
    })
  }
  return out
}

const entries = buildEntries(PAGES)
const index = new MiniSearch<Entry>({ fields: ['title', 'heading', 'text', 'keywords'], storeFields: [], idField: 'id', searchOptions: { boost: { title: 4, heading: 3, keywords: 3 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' } })
index.addAll(entries)
const byId = new Map(entries.map(e => [e.id, e]))

export interface SearchHit { key: string; page: DocPage; category: string; heading: string; href: string; snippet: string }

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  const at = terms.map(t => lower.indexOf(t.toLowerCase())).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, at - 40)
  return (start ? '…' : '') + text.slice(start, start + 140) + (start + 140 < text.length ? '…' : '')
}

export function search(query: string, limit = 12): SearchHit[] {
  const q = query.trim()
  if (!q) return []
  const seen = new Set<string>()
  const hits: SearchHit[] = []
  for (const r of index.search(q)) {
    const e = byId.get(r.id)
    if (!e) continue
    const key = e.page.path + '#' + e.anchor
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({ key, page: e.page, category: categoryTitle(e.page.category), heading: e.heading, href: e.page.path + (e.anchor ? `#${e.anchor}` : ''), snippet: snippet(e.text || e.page.description, r.terms) })
    if (hits.length >= limit) break
  }
  return hits
}
