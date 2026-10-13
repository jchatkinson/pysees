import GithubSlugger from 'github-slugger'

export interface DocHeading { id: string; text: string; level: 2 | 3 }
export interface DocPage { category: string; slug: string; path: string; title: string; description: string; order: number; keywords: string; body: string; headings: DocHeading[] }
export interface DocCategory { id: string; title: string; pages: DocPage[] }

/** Category order and titles. A content folder not listed here is ignored. */
export const CATEGORIES: { id: string; title: string }[] = [
  { id: 'getting-started', title: 'Getting started' },
  { id: 'model', title: 'Building a model' },
  { id: 'viewport', title: 'Viewport & display' },
  { id: 'analysis', title: 'Analysis' },
  { id: 'results', title: 'Results' },
  { id: 'files', title: 'Files & interoperability' },
  { id: 'carapace', title: 'Carapace solver' },
  { id: 'reference', title: 'Reference' },
]

const raw = import.meta.glob('./content/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Minimal `key: value` frontmatter reader (no YAML dependency). */
export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)
  if (!m) return { meta: {}, body: src }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: src.slice(m[0].length) }
}

export function extractHeadings(body: string): DocHeading[] {
  const slugger = new GithubSlugger()
  const out: DocHeading[] = []
  let fence = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fence = !fence; continue }
    if (fence) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const text = m[2].replace(/[`*_]/g, '')
    const id = slugger.slug(text)
    if (m[1].length > 1) out.push({ id, text, level: m[1].length as 2 | 3 })
  }
  return out
}

function build(): DocPage[] {
  const known = new Set(CATEGORIES.map(c => c.id))
  const pages: DocPage[] = []
  for (const [file, src] of Object.entries(raw)) {
    const m = /^\.\/content\/([^/]+)\/([^/]+)\.md$/.exec(file)
    if (!m || !known.has(m[1])) continue
    const { meta, body } = parseFrontmatter(src)
    pages.push({ category: m[1], slug: m[2], path: `/docs/${m[1]}/${m[2]}`, title: meta.title ?? m[2], description: meta.description ?? '', order: Number(meta.order ?? 999), keywords: meta.keywords ?? '', body, headings: extractHeadings(body) })
  }
  return pages
}

export const PAGES: DocPage[] = build()

export const TREE: DocCategory[] = CATEGORIES.map(c => ({
  ...c,
  pages: PAGES.filter(p => p.category === c.id).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
})).filter(c => c.pages.length)

/** Pages in reading order, for prev/next. */
export const FLAT: DocPage[] = TREE.flatMap(c => c.pages)

export const findPage = (category?: string, slug?: string) => PAGES.find(p => p.category === category && p.slug === slug)
export const categoryTitle = (id: string) => CATEGORIES.find(c => c.id === id)?.title ?? id
