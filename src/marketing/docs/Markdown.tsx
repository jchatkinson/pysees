import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import { Link } from 'react-router-dom'
import { Info, Lightbulb, TriangleAlert } from 'lucide-react'

const CALLOUTS = {
  NOTE: { icon: Info, cls: 'border-sky-200 bg-sky-50 text-sky-900', label: 'Note' },
  TIP: { icon: Lightbulb, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', label: 'Tip' },
  WARNING: { icon: TriangleAlert, cls: 'border-amber-200 bg-amber-50 text-amber-900', label: 'Warning' },
} as const

/** Text of the first leaf in a React tree (used to sniff `[!NOTE]` markers). */
function firstText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return firstText(node[0])
  if (isValidElement<{ children?: ReactNode }>(node)) return firstText(node.props.children)
  return ''
}

/** Remove the `[!KIND]` marker from the first text node. */
function stripMarker(node: ReactNode): ReactNode {
  if (typeof node === 'string') return node.replace(/^\s*\[!(NOTE|TIP|WARNING)\]\s*/, '')
  if (Array.isArray(node)) return node.map((n, i) => (i === 0 ? stripMarker(n) : n))
  if (isValidElement<{ children?: ReactNode }>(node)) return { ...node, props: { ...node.props, children: stripMarker(node.props.children) } }
  return node
}

const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4', cls: string) => ({ children, id }: { children?: ReactNode; id?: string }) => (
  <Tag id={id} className={`scroll-mt-24 ${cls}`}>
    {id ? <a href={`#${id}`} className="no-underline hover:underline">{children}</a> : children}
  </Tag>
)

const components: Components = {
  h1: heading('h2', 'mb-4 text-3xl font-semibold tracking-tight text-slate-900'),
  h2: heading('h2', 'mt-10 mb-3 border-b border-slate-200 pb-2 text-xl font-semibold tracking-tight text-slate-900'),
  h3: heading('h3', 'mt-6 mb-2 text-base font-semibold text-slate-900'),
  h4: heading('h4', 'mt-4 mb-1 text-sm font-semibold text-slate-900'),
  p: ({ children }) => <p className="my-3 leading-7 text-slate-700">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-slate-700">{children}</ol>,
  a: ({ href = '', children }) => (/^(\/|#)/.test(href) ? <Link to={href} className="text-sky-700 underline underline-offset-2 hover:text-sky-900">{children}</Link> : <a href={href} target="_blank" rel="noreferrer" className="text-sky-700 underline underline-offset-2 hover:text-sky-900">{children}</a>),
  code: ({ className, children }) => (className ? <code className={className}>{children}</code> : <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>),
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-6 text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">{children}</pre>,
  table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-900">{children}</th>,
  td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top text-slate-700">{children}</td>,
  img: ({ src, alt }) => <img src={src} alt={alt} className="my-4 max-w-full rounded-lg border border-slate-200" loading="lazy" decoding="async" />,
  hr: () => <hr className="my-8 border-slate-200" />,
  kbd: ({ children }) => <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>,
  blockquote: ({ children }) => {
    const kids = Children.toArray(children)
    const m = /^\s*\[!(NOTE|TIP|WARNING)\]/.exec(firstText(kids.find(k => isValidElement(k)) ?? ''))
    if (!m) return <blockquote className="my-4 border-l-4 border-slate-300 pl-4 text-slate-600">{children}</blockquote>
    const { icon: Icon, cls, label } = CALLOUTS[m[1] as keyof typeof CALLOUTS]
    let done = false
    const body = kids.map(k => (!done && isValidElement(k) ? ((done = true), stripMarker(k)) : k))
    return (
      <aside className={`my-4 rounded-lg border p-4 ${cls}`}>
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" />{label}</p>
        <div className="text-sm [&_p]:my-1 [&_p]:text-inherit [&_ul]:text-inherit">{body}</div>
      </aside>
    )
  },
}

export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSlug]} components={components}>{children}</ReactMarkdown>
}
