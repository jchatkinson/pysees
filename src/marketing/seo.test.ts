import { describe, expect, it } from 'vitest'
import { NOT_FOUND, PRERENDER_PATHS, SITEMAP_PATHS, headTags, metaFor } from './seo'

describe('seo', () => {
  const metas = PRERENDER_PATHS.map(metaFor)
  it('gives every prerendered page a unique title and a description', () => {
    expect(new Set(metas.map(m => m.title)).size).toBe(metas.length)
    for (const m of metas) { expect(m.title.length).toBeLessThanOrEqual(70); expect(m.description.length).toBeGreaterThan(20) }
  })
  it('keeps the studio out of the sitemap and noindexes it', () => {
    expect(SITEMAP_PATHS).not.toContain('/studio')
    expect(metaFor('/studio').robots).toMatch(/noindex/)
    expect(SITEMAP_PATHS).toContain('/')
  })
  it('noindexes unknown routes and docs slugs', () => {
    for (const p of ['/nope', '/docs/model/nope']) expect(metaFor(p).robots).toMatch(/noindex/)
    expect(headTags(NOT_FOUND)).not.toContain('canonical')
  })
  it('emits a canonical on pysees.app without a trailing slash', () => {
    expect(headTags(metaFor('/about/'))).toContain('<link rel="canonical" href="https://pysees.app/about">')
    expect(headTags(metaFor('/'))).toContain('href="https://pysees.app"')
  })
})
