import { evalExpr, ScriptError, type Scope, type Val } from '@/app/lib/scriptImport/expr'
import type { ImportDiagnostic, ParsedCall, ParseResult } from '@/app/lib/scriptImport/types'

/** Tcl housekeeping that has no model meaning and no diagnostic value. */
const SILENT = new Set(['puts', 'package', 'file', 'cd', 'global', 'variable', 'format', 'unset', 'clock', 'pwd', 'exit', 'rename', 'namespace'])
/** Tcl control flow: executing it is exactly what a static import does not do. */
const CONTROL = new Set(['for', 'foreach', 'while', 'if', 'proc', 'switch', 'catch', 'eval', 'uplevel', 'lappend', 'lset', 'array', 'list', 'string', 'regexp', 'regsub'])
/** Commands whose last braced word is a body of further OpenSees commands. */
const BLOCK_FNS = new Set(['pattern', 'section'])

interface Word { text: string; kind: 'bare' | 'quoted' | 'braced'; start: number }

class Cursor {
  readonly src: string
  readonly base: number
  readonly lineAt: (offset: number) => number
  i = 0
  constructor(src: string, base: number, lineAt: (offset: number) => number) { this.src = src; this.base = base; this.lineAt = lineAt }
  get line() { return this.lineAt(this.base + this.i) }
}

function skipBalanced(src: string, i: number, open: string, close: string): number {
  let depth = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') { i++; continue }
    if (c === open) depth++
    else if (c === close && --depth === 0) return i
  }
  throw new ScriptError(`unbalanced "${open}"`)
}

/** Splits `src` into commands of raw words, honouring `{}` `""` `[]`, comments, `;` and `\` continuations. */
function splitCommands(cur: Cursor): { words: Word[]; line: number; comment?: string }[] {
  const { src } = cur
  const out: { words: Word[]; line: number; comment?: string }[] = []
  let words: Word[] = []
  let line = 0
  let comment: { text: string; line: number } | undefined
  let attached: string | undefined
  const flush = () => { if (words.length) out.push({ words, line, comment: attached }); words = [] }
  while (cur.i < src.length) {
    const c = src[cur.i]
    if (c === '\\' && src[cur.i + 1] === '\n') { cur.i += 2; continue }
    if (c === '\n' || c === ';') { flush(); cur.i++; continue }
    if (c === ' ' || c === '\t' || c === '\r') { cur.i++; continue }
    if (!words.length) {
      if (c === '#') {
        const from = cur.i + 1
        const at = cur.line
        while (cur.i < src.length && src[cur.i] !== '\n') cur.i++
        comment = { text: src.slice(from, cur.i).trim(), line: at }
        continue
      }
      line = cur.line
      attached = comment && comment.line === line - 1 && comment.text ? comment.text : undefined
    }
    if (c === '{') {
      const end = skipBalanced(src, cur.i, '{', '}')
      words.push({ text: src.slice(cur.i + 1, end), kind: 'braced', start: cur.i + 1 }); cur.i = end + 1
    } else if (c === '"') {
      let j = cur.i + 1
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1
      if (j >= src.length) throw new ScriptError('unterminated string')
      words.push({ text: src.slice(cur.i + 1, j), kind: 'quoted', start: cur.i + 1 }); cur.i = j + 1
    } else {
      let j = cur.i
      while (j < src.length && !' \t\r\n;'.includes(src[j])) {
        if (src[j] === '[') j = skipBalanced(src, j, '[', ']')
        else if (src[j] === '\\') j++
        j++
      }
      words.push({ text: src.slice(cur.i, j), kind: 'bare', start: cur.i }); cur.i = j
    }
  }
  flush()
  return out
}

function scalar(text: string): Val {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) && !/^0[xob]/i.test(text.trim()) ? n : text
}

/** `$x`, `${x}` and `[expr ...]` substitution inside a word. A word that is exactly one substitution keeps its type. */
function substitute(text: string, scope: Scope): Val {
  const whole = text.match(/^\$(?:\{([^}]+)\}|([A-Za-z_][A-Za-z0-9_]*))$/)
  if (whole) return lookup(whole[1] ?? whole[2], scope)
  const cmd = text.match(/^\[(.*)\]$/s)
  if (cmd && !text.slice(1, -1).includes('[')) return bracket(cmd[1], scope)
  if (!/[$[]/.test(text)) return scalar(text)
  return text.replace(/\$(?:\{([^}]+)\}|([A-Za-z_][A-Za-z0-9_]*))|\[([^\]]*)\]/g, (_m, a, b, c) => String(c !== undefined ? bracket(c, scope) : lookup(a ?? b, scope)))
}

function lookup(name: string, scope: Scope): Val {
  if (!scope.has(name)) throw new ScriptError(`variable "$${name}" has no known value`)
  return scope.get(name)!
}

function bracket(body: string, scope: Scope): Val {
  const m = body.trim().match(/^expr\s+(.*)$/s)
  if (!m) throw new ScriptError(`command substitution "[${body.trim().split(/\s+/)[0]} ...]" is not supported (only [expr ...])`)
  const e = m[1].trim()
  return evalExpr(e.startsWith('{') && e.endsWith('}') ? e.slice(1, -1) : e, scope, 'tcl')
}

function listWords(text: string, scope: Scope): Val[] {
  return splitCommands(new Cursor(text, 0, () => 0)).flatMap((c) => c.words).map((w) => evalWord(w, scope))
}

function evalWord(w: Word, scope: Scope): Val {
  if (w.kind === 'braced') return listWords(w.text, scope)
  if (w.kind === 'quoted') return substitute(w.text, scope)
  return substitute(w.text, scope)
}

/** Static Tcl reader: collects OpenSees commands and constant `set`s; never runs control flow. */
export function parseTcl(text: string): ParseResult {
  const lines = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1)
  const lineAt = (offset: number) => {
    let lo = 0, hi = lines.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines[mid] <= offset) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
  const scope: Scope = new Map()
  const calls: ParsedCall[] = []
  const diagnostics: ImportDiagnostic[] = []
  const procs = new Set<string>()
  const note = (severity: ImportDiagnostic['severity'], message: string, line: number) => diagnostics.push({ severity, message, line })

  function run(src: string, base: number) {
    let cmds: ReturnType<typeof splitCommands>
    try { cmds = splitCommands(new Cursor(src, base, lineAt)) } catch (e) { note('error', (e as Error).message, lineAt(base)); return }
    for (const { words, line, comment } of cmds) {
      const fn = words[0].text
      try {
        if (fn === 'set') {
          if (words.length >= 3) scope.set(words[1].text, evalWord(words[2], scope))
          continue
        }
        if (fn === 'incr') {
          const cur = scope.get(words[1].text)
          if (typeof cur === 'number') scope.set(words[1].text, cur + (words[2] ? Number(evalWord(words[2], scope)) : 1))
          continue
        }
        if (SILENT.has(fn)) continue
        if (CONTROL.has(fn)) {
          if (fn === 'proc' && words[1]) procs.add(words[1].text)
          note('error', `"${fn}" is not supported — scripts are read, not executed. Commands inside it were skipped.`, line)
          continue
        }
        if (fn === 'source') { note('warning', `"source ${words[1]?.text ?? ''}" was not followed — import that file separately.`, line); continue }
        if (procs.has(fn)) { note('error', `call to user procedure "${fn}" was skipped (procedures are not executed).`, line); continue }
        const last = words[words.length - 1]
        const hasBody = BLOCK_FNS.has(fn) && words.length > 1 && last.kind === 'braced'
        const argWords = hasBody ? words.slice(1, -1) : words.slice(1)
        calls.push({ fn, args: argWords.map((w) => evalWord(w, scope)), line, comment })
        if (hasBody) {
          run(last.text, base + last.start) // offset keeps nested commands' line numbers real
        }
      } catch (e) {
        if (!(e instanceof ScriptError)) throw e
        if (CONTROL.has(fn)) continue
        note('error', `"${fn}" skipped: ${e.message}.`, line)
      }
    }
  }
  run(text, 0)
  return { calls, diagnostics }
}
