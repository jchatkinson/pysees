import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { PiscesLogo } from '@/app/components/icons/PiscesLogo'
import { Link } from 'react-router-dom'

interface MarketingHeaderProps {
  currentPath: string
}

const NAV = [['Features', '/#features'], ['Change Log', '/#changelog'], ['Docs', '/docs'], ['Solver', '/carapace'], ['About', '/about'], ['Contact', '/contact']] as const

function navItem(label: string, href: string, currentPath: string, className = '', onClick?: () => void) {
  const active = href === currentPath || (href !== '/' && !href.includes('#') && currentPath.startsWith(href + '/'))
  return (
    <Link key={href} to={href} onClick={onClick} aria-current={active ? 'page' : undefined} className={`text-sm transition-colors ${active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'} ${className}`}>
      {label}
    </Link>
  )
}

export function MarketingHeader({ currentPath }: MarketingHeaderProps) {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-40 focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-slate-900 focus:shadow-md">Skip to content</a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <PiscesLogo className="h-6 w-6 text-sky-600" aria-hidden="true" />
          <span className="text-base font-semibold tracking-tight">PySees</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {NAV.map(([label, href]) => navItem(label, href, currentPath))}
        </nav>
        <div className="flex items-center gap-2">
          <Button size="sm" render={<Link to="/studio">Open Studio</Link>} />
          <button type="button" aria-label="Toggle navigation menu" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(o => !o)} className="grid h-9 w-9 place-items-center rounded-md border md:hidden">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-1 border-t bg-white px-4 py-3 md:hidden">
          {NAV.map(([label, href]) => navItem(label, href, currentPath, 'py-2', () => setOpen(false)))}
        </nav>
      )}
    </header>
  )
}
