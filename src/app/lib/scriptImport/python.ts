import { evalArgs, evalExpr, isAssignment, ScriptError, type Scope } from '@/app/lib/scriptImport/expr'
import type { ImportDiagnostic, ParsedCall, ParseResult } from '@/app/lib/scriptImport/types'

/** Python statements whose body is only reached by running the script. */
const BLOCK_START = /^(for|while|if|elif|else|def|class|with|try|except|finally)\b/

/** Joins physical lines into logical statements (open brackets / `\` continuations), dropping comments. */
function logicalLines(text: string): { src: string; line: number; indent: number; comment?: string }[] {
  const out: { src: string; line: number; indent: number; comment?: string }[] = []
  let comment: { text: string; line: number } | undefined
  let attached: string | undefined
  let buf = ''
  let start = 0
  let depth = 0
  let indent = 0
  text.split(/\r?\n/).forEach((raw, idx) => {
    let quote = ''
    let code = ''
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]
      if (quote) { code += c; if (c === '\\') code += raw[++i] ?? ''; else if (c === quote) quote = ''; continue }
      if (c === '#') break
      if (c === '"' || c === "'") quote = c
      else if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) depth--
      code += c
    }
    if (!buf && !code.trim()) { if (raw.trim().startsWith('#')) comment = { text: raw.trim().replace(/^#+\s*/, ''), line: idx + 1 }; return }
    if (!buf) { start = idx + 1; indent = raw.length - raw.trimStart().length; attached = comment && comment.line === start - 1 && comment.text ? comment.text : undefined }
    const cont = code.trimEnd().endsWith('\\')
    buf += (buf ? ' ' : '') + (cont ? code.trimEnd().slice(0, -1) : code).trim()
    if (depth <= 0 && !cont) { out.push({ src: buf, line: start, indent, comment: attached }); buf = ''; depth = 0 }
  })
  if (buf) out.push({ src: buf, line: start, indent, comment: attached })
  return out
}

/** Static Python reader: collects `ops.<command>(...)` calls and constant assignments; never runs loops or functions. */
export function parsePython(text: string): ParseResult {
  const scope: Scope = new Map()
  const calls: ParsedCall[] = []
  const diagnostics: ImportDiagnostic[] = []
  const prefixes = new Set(['ops', 'opensees'])
  let skipBelow = -1 // while >= 0, statements indented deeper than this belong to a skipped block
  const note = (severity: ImportDiagnostic['severity'], message: string, line: number) => diagnostics.push({ severity, message, line })

  for (const { src, line, indent, comment } of logicalLines(text)) {
    if (skipBelow >= 0) { if (indent > skipBelow) continue; skipBelow = -1 }
    try {
      const imp = src.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?$/)
      if (imp) { if (imp[1].startsWith('openseespy.opensees')) prefixes.add(imp[2] ?? imp[1]); continue }
      if (/^from\s+/.test(src) || /^import\s+/.test(src)) continue
      const block = src.match(BLOCK_START)
      if (block) {
        note('error', `"${block[1]}" is not supported — scripts are read, not executed. Commands inside it were skipped.`, line)
        skipBelow = indent
        continue
      }
      const tuple = src.match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=(?!=)\s*(.*)$/s)
      if (tuple) {
        const names = tuple[1].split(',').map((n) => n.trim())
        let vals = evalArgs(tuple[2], scope, 'py')
        if (vals.length === 1 && Array.isArray(vals[0])) vals = vals[0]
        names.forEach((n, i) => { if (vals[i] !== undefined) scope.set(n, vals[i]); else scope.delete(n) })
        continue
      }
      const assign = isAssignment(src)
      if (assign) {
        try { scope.set(assign.name, evalExpr(assign.rhs, scope, 'py')) } catch { scope.delete(assign.name) } // non-constant: later uses report it
        continue
      }
      const call = src.match(/^((?:[A-Za-z_]\w*\.)*)([A-Za-z_]\w*)\s*\((.*)\)$/s)
      if (!call) { if (/^\w+(\s*,\s*\w+)*\s*=/.test(src) || /[+\-*/]=/.test(src)) note('warning', 'assignment is too dynamic to read and was ignored.', line); continue }
      const [, qualifier, fn, argText] = call
      const owner = qualifier.replace(/\.$/, '')
      if (owner && !prefixes.has(owner)) continue // e.g. print / os.makedirs / plt.plot — not OpenSees
      if (!owner && fn === 'print') continue
      try { calls.push({ fn, args: evalArgs(argText, scope, 'py'), line, comment }) } catch (e) {
        if (!(e instanceof ScriptError)) throw e
        note('error', `"${fn}" skipped: ${e.message}.`, line)
      }
    } catch (e) {
      if (!(e instanceof ScriptError)) throw e
      note('error', `statement skipped: ${e.message}.`, line)
    }
  }
  return { calls, diagnostics }
}
