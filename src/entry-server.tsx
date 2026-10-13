/* eslint-disable react-refresh/only-export-components -- server entry, never hot-reloaded */
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router-dom'
import { TooltipProvider } from '@/app/components/ui/tooltip'
import { marketingRoutes } from '@/marketing/routes'

/** Build-time prerender entry (see scripts/prerender.mjs). Marketing routes only; the studio is client-only. */
export const render = (url: string) => renderToString(
  <TooltipProvider><StaticRouter location={url}><Routes>{marketingRoutes}<Route path="*" element={null} /></Routes></StaticRouter></TooltipProvider>
)

export { FLAT } from '@/marketing/docs/content'
export { NOT_FOUND, PRERENDER_PATHS, SITEMAP_PATHS, SITE, headTags, metaFor } from '@/marketing/seo'
