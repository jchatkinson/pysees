import type { Call, Tok } from '@/app/lib/commands/tokens'

export type ScriptLanguage = 'py' | 'tcl'

/** Shortest round-tripping form; both languages read JS-style exponents (`1e-7`, `2e+11`). */
const fmtNum = (n: number) => String(n)

export const pyLiteral = (v: Tok): string => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : fmtNum(v))
const tclWord = (v: Tok): string => {
  if (typeof v === 'number') return fmtNum(v)
  return v === '' || /[\s{}[\]$"\\;]/.test(v) ? `{${v}}` : v
}

function printCall(c: Call, lang: ScriptLanguage, depth: number): string[] {
  const pad = '    '.repeat(depth)
  const out: string[] = []
  if (c.comment) out.push(`${pad}# ${c.comment}`)
  if (lang === 'py') {
    out.push(`${pad}ops.${c.fn}(${c.args.map(pyLiteral).join(', ')})`)
    for (const child of c.body ?? []) out.push(...printCall(child, lang, depth))
    return out
  }
  const args = c.fn === 'model' && c.args[0] === 'basic' ? ['BasicBuilder', ...c.args.slice(1)] : c.args
  const head = `${pad}${[c.fn, ...args.map(tclWord)].join(' ')}`
  if (!c.body) return [...out, head]
  return [...out, `${head} {`, ...c.body.flatMap((child) => printCall(child, lang, depth + 1)), `${pad}}`]
}

/** Prints commands as an OpenSeesPy or OpenSees Tcl script. Deterministic: the same calls always give the same text. */
export function printScript(calls: Call[], lang: ScriptLanguage): string {
  const lines = lang === 'py' ? ['import openseespy.opensees as ops', ''] : []
  for (const c of calls) lines.push(...printCall(c, lang, 0))
  return lines.join('\n') + '\n'
}
