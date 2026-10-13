import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { applyMeta, metaFor } from '@/marketing/seo'

/** Keeps title/description/canonical/OG in sync with the route (the prerender writes the initial values). */
export function Seo() {
  const { pathname, hash } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    applyMeta(metaFor(pathname))
    // On client navigation (not first load or in-page anchors): reset scroll and move focus to the new page's <main>.
    if (first.current) { first.current = false; return }
    if (hash) return
    window.scrollTo(0, 0)
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
