// Runs after `vite build` and `vite build --ssr`: writes a static HTML file per marketing route (real content +
// per-page head tags), plus sitemap.xml, 404.html and Cloudflare Pages _redirects. See npm run build.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = path.resolve('dist'), ssr = path.resolve('dist-ssr')
const { render, FLAT, NOT_FOUND, PRERENDER_PATHS, SITEMAP_PATHS, SITE, headTags, metaFor } = await import(pathToFileURL(path.join(ssr, 'entry-server.js')).href)
const template = await readFile(path.join(dist, 'index.html'), 'utf8')
if (!template.includes('<!--head-->') || !template.includes('<!--app-->')) throw new Error('index.html is missing the <!--head--> / <!--app--> placeholders')

// Preload the body font (its hashed name is only known after the build) so text doesn't wait on CSS -> font discovery.
const font = (await readdir(path.join(dist, 'assets'))).find(f => /^instrument-sans-latin-wght-normal-.*\.woff2$/.test(f))
const preload = font ? `\n  <link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/${font}">` : ''
const page = (meta, body) => template.replace('<!--head-->', headTags(meta) + preload).replace('<!--app-->', body)
const out = async (file, text) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text) }

for (const p of PRERENDER_PATHS) {
  const body = p === '/studio' ? '' : render(p)
  if (p !== '/studio' && !body.includes('<h1')) throw new Error(`prerender of ${p} produced no <h1>`)
  await out(path.join(dist, p === '/' ? 'index.html' : `${p}/index.html`), page(metaFor(p), body))
}
await out(path.join(dist, '404.html'), page(NOT_FOUND, ''))
await out(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP_PATHS.map(p => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc></url>`).join('\n')}\n</urlset>\n`)
await out(path.join(dist, '_redirects'), [`/docs ${FLAT[0].path} 301`, `/docs/ ${FLAT[0].path} 301`, '/signup/* /studio 301', '/login/* /studio 301', '/app /studio 301', ''].join('\n'))
await rm(ssr, { recursive: true, force: true })
console.log(`prerendered ${PRERENDER_PATHS.length} pages, ${SITEMAP_PATHS.length} in sitemap`)
