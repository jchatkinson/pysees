import { Button } from '@/components/ui/button'
import { PiscesLogo } from '@/components/icons/PiscesLogo'

interface MarketingHeaderProps {
  currentPath: string
}

function navItem(label: string, href: string, currentPath: string) {
  const active = href === currentPath
  return (
    <a key={href} href={href} className={`text-sm transition-colors ${active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
      {label}
    </a>
  )
}

export function MarketingHeader({ currentPath }: MarketingHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <a href="/" className="flex items-center gap-2">
          <PiscesLogo className="h-6 w-6 text-sky-600" />
          <span className="text-base font-semibold tracking-tight">PySees</span>
        </a>
        <nav className="hidden items-center gap-6 md:flex">
          {navItem('Features', '/#features', currentPath)}
          {navItem('Change Log', '/#changelog', currentPath)}
          {navItem('About', '/about', currentPath)}
          {navItem('Contact', '/contact', currentPath)}
        </nav>
        <Button asChild size="sm">
          <a href="/studio">Open Studio</a>
        </Button>
      </div>
    </header>
  )
}
