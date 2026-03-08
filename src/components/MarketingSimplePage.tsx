import { MarketingHeader } from '@/components/MarketingHeader'

interface MarketingSimplePageProps {
  title: string
  description: string
}

export function MarketingSimplePage({ title, description }: MarketingSimplePageProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <MarketingHeader currentPath={title === 'About' ? '/about' : title === 'Contact' ? '/contact' : ''} />
      <section className="mx-auto w-full max-w-4xl px-4 py-16 md:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-4 text-base text-slate-600">{description}</p>
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">Scaffold ready for your reference screenshots and final copy.</div>
      </section>
    </main>
  )
}
