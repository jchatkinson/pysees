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
  if (c.fn === 'rayleighFromModes') {
    const [mode1, mode2, ratio] = c.args.map(Number)
    if (![mode1, mode2].every((v) => Number.isInteger(v) && v > 0) || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error('Invalid modal damping anchors')
    const count = Math.max(mode1, mode2)
    const lines = lang === 'py' ? [
      `# Resolve T${mode1} and T${mode2} from the current model state for Rayleigh damping.`,
      `_pysees_damping_eigen = ops.eigen('-fullGenLapack', ${count})`,
      `if not all(0 < value < 1e300 for value in (_pysees_damping_eigen[${mode1 - 1}], _pysees_damping_eigen[${mode2 - 1}])): raise ValueError('Requested damping modes must have finite positive eigenvalues')`,
      `_pysees_damping_w1 = _pysees_damping_eigen[${mode1 - 1}] ** 0.5`,
      `_pysees_damping_w2 = _pysees_damping_eigen[${mode2 - 1}] ** 0.5`,
      `ops.rayleigh(2 * ${ratio} * _pysees_damping_w1 * _pysees_damping_w2 / (_pysees_damping_w1 + _pysees_damping_w2), 2 * ${ratio} / (_pysees_damping_w1 + _pysees_damping_w2), 0, 0)`,
    ] : [
      `# Resolve T${mode1} and T${mode2} from the current model state for Rayleigh damping.`,
      `set _pysees_damping_eigen [eigen -fullGenLapack ${count}]`,
      `if {!([lindex $_pysees_damping_eigen ${mode1 - 1}] > 0 && [lindex $_pysees_damping_eigen ${mode1 - 1}] < 1e300 && [lindex $_pysees_damping_eigen ${mode2 - 1}] > 0 && [lindex $_pysees_damping_eigen ${mode2 - 1}] < 1e300)} {error "Requested damping modes must have finite positive eigenvalues"}`,
      `set _pysees_damping_w1 [expr {sqrt([lindex $_pysees_damping_eigen ${mode1 - 1}])}]`,
      `set _pysees_damping_w2 [expr {sqrt([lindex $_pysees_damping_eigen ${mode2 - 1}])}]`,
      `rayleigh [expr {2 * ${ratio} * $_pysees_damping_w1 * $_pysees_damping_w2 / ($_pysees_damping_w1 + $_pysees_damping_w2)}] [expr {2 * ${ratio} / ($_pysees_damping_w1 + $_pysees_damping_w2)}] 0 0`,
    ]
    return [...out, `${pad}# PySees: modal damping begin`, ...lines.map((line) => pad + line), `${pad}# PySees: modal damping end`]
  }
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
