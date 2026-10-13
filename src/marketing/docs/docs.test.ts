import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, PAGES, extractHeadings, parseFrontmatter } from './content'
import { search } from './search'

describe('docs content', () => {
  it('has pages, each in a known category with a title and description', () => {
    expect(PAGES.length).toBeGreaterThan(0)
    for (const p of PAGES) {
      expect(CATEGORIES.map(c => c.id), p.path).toContain(p.category)
      expect(p.title, p.path).toBeTruthy()
      expect(p.description, p.path).toBeTruthy()
    }
  })

  it('has unique paths', () => {
    const paths = PAGES.map(p => p.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('resolves every internal /docs link and anchor', () => {
    for (const p of PAGES) {
      for (const m of p.body.matchAll(/\]\((\/docs\/[^)\s]+)\)/g)) {
        if (/\.(png|jpe?g|gif|webp|svg|mp4)(#|$)/.test(m[1])) { expect(existsSync(`public${m[1]}`), `${p.path} image ${m[1]}`).toBe(true); continue }
        const [path, hash] = m[1].split('#')
        const target = PAGES.find(t => t.path === path)
        expect(target, `${p.path} links to missing ${path}`).toBeDefined()
        if (hash) expect(target!.headings.map(h => h.id), `${p.path} -> ${m[1]}`).toContain(hash)
      }
    }
  })

  it('parses frontmatter and headings (ignoring code fences)', () => {
    const { meta, body } = parseFrontmatter('---\ntitle: "A"\norder: 2\n---\n# T\n## One\n```\n## no\n```\n### Two words\n')
    expect(meta).toEqual({ title: 'A', order: '2' })
    expect(extractHeadings(body).map(h => h.id)).toEqual(['one', 'two-words'])
  })
})

describe('docs search', () => {
  it('finds pages by body text and deep-links to the heading', () => {
    const hits = search('crossing')
    expect(hits[0]?.page.slug).toBe('navigation-selection')
    expect(hits[0].href).toContain('#')
  })

  it('returns nothing for an empty query', () => {
    expect(search('  ')).toEqual([])
  })
})
