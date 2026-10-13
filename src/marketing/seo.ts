import { FLAT, categoryTitle, findPage } from '@/marketing/docs/content'

export const SITE = 'https://pysees.app'
export const OG_IMAGE = `${SITE}/docs/interface-tour.png`
const NAME = 'PySees'
const TAGLINE = 'Browser-based structural modeling, analysis and results'
const DESC = 'Model 2D and 3D frames, trusses and shells, run static, eigen and transient analyses in your browser on the Carapace solver, review results, and export a valid OpenSeesPy script.'

export interface Meta { title: string; description: string; path: string; robots?: string; ogType?: 'website' | 'article'; jsonLd?: object[] }

const STATIC: Record<string, Omit<Meta, 'path'>> = {
  '/': {
    title: `${NAME} – ${TAGLINE}`, description: DESC,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: SITE },
      { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: NAME, url: SITE, applicationCategory: 'EngineeringApplication', operatingSystem: 'Any (web browser)', description: DESC, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    ],
  },
  '/carapace': { title: `Carapace solver – ${NAME}`, description: 'Carapace is the Rust finite-element engine, compiled to WebAssembly, that runs PySees analyses in your browser and is validated against OpenSees.' },
  '/about': { title: `About – ${NAME}`, description: 'The mission and values behind PySees, a free browser-based GUI for building, running and reviewing OpenSees structural models.' },
  '/contact': { title: `Contact – ${NAME}`, description: 'Get in touch about PySees: questions, bug reports and feature requests.' },
  '/terms': { title: `Terms of Use & Privacy – ${NAME}`, description: 'Terms of use and privacy policy for PySees. Models and results stay in your browser.' },
  '/studio': { title: `Studio – ${NAME}`, description: 'The PySees modeling studio.', robots: 'noindex, follow' },
}

export const NOT_FOUND: Meta = { title: `Page not found – ${NAME}`, description: 'This page does not exist.', path: '/404', robots: 'noindex, follow' }

export function metaFor(pathname: string): Meta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const s = STATIC[path]
  if (s) return { ...s, path }
  const m = /^\/docs\/([^/]+)\/([^/]+)$/.exec(path)
  const page = m && findPage(m[1], m[2])
  if (page) {
    const url = SITE + page.path
    return {
      path, ogType: 'article', title: `${page.title} – ${NAME} Docs`, description: page.description || `${page.title} in the ${NAME} documentation.`,
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'TechArticle', headline: page.title, description: page.description, url, publisher: { '@type': 'Organization', name: NAME, url: SITE } },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Docs', `${SITE}/docs`], [categoryTitle(page.category), url], [page.title, url]].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) },
      ],
    }
  }
  return { ...NOT_FOUND, path }
}

/** Every URL that is prerendered; `/studio` is prerendered (own meta) but not in the sitemap. */
export const PRERENDER_PATHS = ['/', '/about', '/carapace', '/contact', '/terms', '/studio', ...FLAT.map(p => p.path)]
export const SITEMAP_PATHS = PRERENDER_PATHS.filter(p => !STATIC[p]?.robots)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const ld = (o: object[]) => o.map(x => `<script type="application/ld+json" data-seo>${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('')

/** Head markup for the prerender (client navigation updates the same tags via `applyMeta`). */
export function headTags(m: Meta): string {
  const url = SITE + (m.path === '/' ? '' : m.path)
  const t = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    m.robots ? `<meta name="robots" content="${m.robots}">` : '',
    m.path === '/404' ? '' : `<link rel="canonical" href="${url}">`,
    `<meta property="og:site_name" content="${NAME}">`, `<meta property="og:type" content="${m.ogType ?? 'website'}">`,
    `<meta property="og:title" content="${esc(m.title)}">`, `<meta property="og:description" content="${esc(m.description)}">`, `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="${esc(m.title)}">`, `<meta name="twitter:description" content="${esc(m.description)}">`, `<meta name="twitter:image" content="${OG_IMAGE}">`,
  ]
  return t.filter(Boolean).join('\n  ') + (m.jsonLd ? '\n  ' + ld(m.jsonLd) : '')
}

/** Client-side counterpart of `headTags`: updates the prerendered tags in place so navigation never duplicates them. */
export function applyMeta(m: Meta) {
  const url = SITE + (m.path === '/' ? '' : m.path)
  const set = (sel: string, make: () => Element, attr: string, val: string | undefined) => {
    let el = document.head.querySelector(sel)
    if (!val) { el?.remove(); return }
    if (!el) { el = make(); document.head.appendChild(el) }
    el.setAttribute(attr, val)
  }
  const meta = (key: 'name' | 'property', k: string, val?: string) => set(`meta[${key}="${k}"]`, () => { const e = document.createElement('meta'); e.setAttribute(key, k); return e }, 'content', val)
  document.title = m.title
  meta('name', 'description', m.description); meta('name', 'robots', m.robots)
  set('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', m.path === '/404' ? undefined : url)
  meta('property', 'og:type', m.ogType ?? 'website'); meta('property', 'og:title', m.title); meta('property', 'og:description', m.description); meta('property', 'og:url', url)
  meta('name', 'twitter:title', m.title); meta('name', 'twitter:description', m.description)
  document.head.querySelectorAll('script[data-seo]').forEach(e => e.remove())
  for (const o of m.jsonLd ?? []) { const s = document.createElement('script'); s.type = 'application/ld+json'; s.dataset.seo = ''; s.textContent = JSON.stringify(o); document.head.appendChild(s) }
}
