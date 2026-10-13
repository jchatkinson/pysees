import { Route } from 'react-router-dom'
import { LandingPage } from '@/marketing/pages/LandingPage'
import { AboutPage } from '@/marketing/pages/AboutPage'
import { CarapacePage } from '@/marketing/pages/CarapacePage'
import { ContactPage } from '@/marketing/pages/ContactPage'
import { TermsPage } from '@/marketing/pages/TermsPage'
import { DocsPage } from '@/marketing/docs/DocsPage'

/** Marketing routes, shared by the client `App` and the build-time prerender (`entry-server.tsx`). */
export const marketingRoutes = (
  <>
    <Route path="/" element={<LandingPage />} />
    <Route path="/docs" element={<DocsPage />} />
    <Route path="/docs/:category/:slug" element={<DocsPage />} />
    <Route path="/carapace" element={<CarapacePage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/terms" element={<TermsPage />} />
  </>
)
