import { Button } from '@/components/ui/button'
import { PiscesLogo } from '@/components/icons/PiscesLogo'
import { Link } from 'react-router-dom'
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'

interface MarketingHeaderProps {
  currentPath: string
}

function navItem(label: string, href: string, currentPath: string) {
  const active = href === currentPath
  return (
    <Link key={href} to={href} className={`text-sm transition-colors ${active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
      {label}
    </Link>
  )
}

export function MarketingHeader({ currentPath }: MarketingHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <PiscesLogo className="h-6 w-6 text-sky-600" />
          <span className="text-base font-semibold tracking-tight">PySees</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {navItem('Features', '/#features', currentPath)}
          {navItem('Change Log', '/#changelog', currentPath)}
          {navItem('About', '/about', currentPath)}
          {navItem('Contact', '/contact', currentPath)}
        </nav>
        <div className="flex items-center gap-2">
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">Log in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Sign up</Button>
            </SignUpButton>
          </SignedOut>
          <Button asChild size="sm">
            <Link to="/studio">Open Studio</Link>
          </Button>
          <SignedIn>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'h-8 w-8' } }} />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
