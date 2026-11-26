import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getPdf } from './fileStore'

/** pdf.js is loaded on first use so it stays out of the app bundle. */
let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null
function lib() {
  return pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, w]) => {
    m.GlobalWorkerOptions.workerSrc = w.default
    return m
  })
}

/** Opens a PDF from bytes (pdf.js takes ownership of the buffer, so a copy is passed). */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  return (await lib()).getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
}

/** Page sizes in points (as displayed, /Rotate applied). */
export async function pageSizes(doc: PDFDocumentProxy): Promise<[number, number][]> {
  const out: [number, number][] = []
  for (let i = 1; i <= doc.numPages; i++) { const v = (await doc.getPage(i)).getViewport({ scale: 1 }); out.push([v.width, v.height]) }
  return out
}

/** Renders a page onto a white canvas whose long side is `longSide` pixels. */
export async function renderPage(doc: PDFDocumentProxy, page: number, longSide: number): Promise<HTMLCanvasElement> {
  const p = await doc.getPage(page)
  const base = p.getViewport({ scale: 1 })
  const viewport = p.getViewport({ scale: longSide / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
  await p.render({ canvas, viewport, background: 'white' }).promise
  return canvas
}

/** Copy of `src` with alpha from darkness, so white paper vanishes and lines keep their colour. */
export function knockoutWhite(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.width; out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, out.width, out.height), d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const a = 255 - Math.min(d[i], d[i + 1], d[i + 2])
    if (a === 0) { d[i + 3] = 0; continue }
    // Un-blend from white so the visible colour matches the original line.
    const k = 255 / a
    d[i] = 255 - (255 - d[i]) * k; d[i + 1] = 255 - (255 - d[i + 1]) * k; d[i + 2] = 255 - (255 - d[i + 2]) * k; d[i + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return out
}

const docs = new Map<string, Promise<PDFDocumentProxy | null>>()
const pages = new Map<string, Promise<HTMLCanvasElement | null>>()
const knocked = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

/** The stored PDF with this hash, opened once; null when the file isn't in this browser. */
export function storedDoc(hash: string): Promise<PDFDocumentProxy | null> {
  let d = docs.get(hash)
  if (!d) {
    d = getPdf(hash).then((f) => (f ? openPdf(f.bytes) : null)).catch(() => null)
    docs.set(hash, d)
    void d.then((x) => { if (!x) docs.delete(hash) })
  }
  return d
}

/** Rendered page of a stored PDF (cached), knocked out when asked; null when the file is missing. */
export async function underlayImage(hash: string, page: number, longSide: number, knockout: boolean): Promise<HTMLCanvasElement | null> {
  const key = `${hash}:${page}:${longSide}`
  let c = pages.get(key)
  if (!c) {
    c = storedDoc(hash).then((d) => (d ? renderPage(d, page, longSide) : null)).catch(() => null)
    pages.set(key, c)
    void c.then((x) => { if (!x) pages.delete(key) })
  }
  const canvas = await c
  if (!canvas || !knockout) return canvas
  let k = knocked.get(canvas)
  if (!k) { k = knockoutWhite(canvas); knocked.set(canvas, k) }
  return k
}
