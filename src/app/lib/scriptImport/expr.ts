/** A script value: a number, a bare word / quoted string, or a list (Tcl `{1 2 3}`, Python `[1, 2, 3]`). */
export type Val = number | string | Val[]
export type Scope = Map<string, Val>
export type Lang = 'tcl' | 'py'

/** A script construct the static importer cannot resolve — reported as a diagnostic, never guessed at. */
export class ScriptError extends Error {}

type Tok = { t: 'num' | 'str' | 'name' | 'var' | 'op'; v: string }

const NUM = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/
const OPS = ['**', '//', '(', ')', '[', ']', ',', '+', '-', '*', '/', '%', '=', '.']

function tokenize(src: string, lang: Lang): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    const rest = src.slice(i)
    let m: RegExpMatchArray | null
    if ((m = rest.match(NUM))) { out.push({ t: 'num', v: m[0] }); i += m[0].length; continue }
    if (c === '$' && lang === 'tcl') {
      const braced = rest.match(/^\$\{([^}]+)\}/)
      const plain = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)/)
      const hit = braced ?? plain
      if (!hit) throw new ScriptError(`unsupported substitution near "${rest.slice(0, 12)}"`)
      out.push({ t: 'var', v: hit[1] }); i += hit[0].length; continue
    }
    if ((m = rest.match(NAME))) { out.push({ t: 'name', v: m[0] }); i += m[0].length; continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1
      if (j >= src.length) throw new ScriptError('unterminated string')
      out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue
    }
    const op = OPS.find((o) => rest.startsWith(o))
    if (!op) throw new ScriptError(`unexpected character "${c}"`)
    out.push({ t: 'op', v: op }); i += op.length
  }
  return out
}

const MATH: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: Math.atan2, exp: Math.exp, log: Math.log, log10: Math.log10, pow: Math.pow, min: Math.min, max: Math.max,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, int: Math.trunc, float: (x) => x, double: (x) => x, radians: (x) => (x * Math.PI) / 180, degrees: (x) => (x * 180) / Math.PI,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }
/** Python module prefixes that only qualify a math function or constant (`math.pi`, `np.sqrt(2)`). */
const MODULES = new Set(['math', 'np', 'numpy'])

class Parser {
  i = 0
  private toks: Tok[]
  private scope: Scope
  private lang: Lang
  constructor(toks: Tok[], scope: Scope, lang: Lang) { this.toks = toks; this.scope = scope; this.lang = lang }
  done() { return this.i >= this.toks.length }
  peek() { return this.toks[this.i] }
  isOp(v: string) { const t = this.toks[this.i]; return t?.t === 'op' && t.v === v }
  eat(v: string) { if (!this.isOp(v)) throw new ScriptError(`expected "${v}"`); this.i++ }

  expr(): Val { return this.add() }

  private num(v: Val): number {
    if (typeof v !== 'number') throw new ScriptError('arithmetic on a non-numeric value')
    return v
  }
  private add(): Val {
    let l = this.mul()
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.toks[this.i++].v
      const r = this.mul()
      // Python allows list + list (`[0, 0] + [1]`); everything else is numeric.
      if (op === '+' && Array.isArray(l) && Array.isArray(r)) l = [...l, ...r]
      else l = op === '+' ? this.num(l) + this.num(r) : this.num(l) - this.num(r)
    }
    return l
  }
  private mul(): Val {
    let l = this.unary()
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      const op = this.toks[this.i++].v
      const r = this.unary()
      if (op === '*' && Array.isArray(l) && typeof r === 'number') { l = Array.from({ length: Math.max(0, r) }, () => l as Val[]).flat(); continue }
      const a = this.num(l); const b = this.num(r)
      if ((op === '/' || op === '//' || op === '%') && b === 0) throw new ScriptError('division by zero')
      l = op === '*' ? a * b : op === '/' ? a / b : op === '//' ? Math.floor(a / b) : a % b
    }
    return l
  }
  private unary(): Val {
    if (this.isOp('-')) { this.i++; return -this.num(this.unary()) }
    if (this.isOp('+')) { this.i++; return this.num(this.unary()) }
    return this.pow()
  }
  /** Python subscripts: `coords[0]`, `pts[-1][1]`. */
  private postfix(): Val {
    let v = this.atom()
    while (this.lang === 'py' && this.isOp('[')) {
      this.i++
      const idx = this.num(this.expr())
      this.eat(']')
      if (!Array.isArray(v)) throw new ScriptError('indexing a non-list')
      const k = idx < 0 ? v.length + idx : idx
      if (!Number.isInteger(k) || k < 0 || k >= v.length) throw new ScriptError('list index out of range')
      v = v[k]
    }
    return v
  }
  private pow(): Val {
    const base = this.postfix()
    if (!this.isOp('**')) return base
    this.i++
    return Math.pow(this.num(base), this.num(this.unary()))
  }
  private atom(): Val {
    const t = this.toks[this.i++]
    if (!t) throw new ScriptError('unexpected end of expression')
    if (t.t === 'num') return Number(t.v)
    if (t.t === 'str') return t.v
    if (t.t === 'var') return this.lookup(t.v)
    if (t.t === 'op' && t.v === '(') {
      const v = this.expr()
      if (this.isOp(',')) { // Python tuple
        const items = [v]
        while (this.isOp(',')) { this.i++; if (this.isOp(')')) break; items.push(this.expr()) }
        this.eat(')'); return items
      }
      this.eat(')'); return v
    }
    if (t.t === 'op' && t.v === '[' && this.lang === 'py') {
      const items: Val[] = []
      while (!this.isOp(']')) { items.push(this.expr()); if (this.isOp(',')) this.i++; else break }
      this.eat(']'); return items
    }
    if (t.t === 'name') {
      let name = t.v
      while (this.lang === 'py' && MODULES.has(name) && this.isOp('.')) { this.i++; name = this.toks[this.i++]?.v ?? '' }
      if (this.isOp('(')) {
        const fn = MATH[name]
        if (!fn) throw new ScriptError(`unsupported function "${name}()"`)
        this.i++
        const args: number[] = []
        while (!this.isOp(')')) { args.push(this.num(this.expr())); if (this.isOp(',')) this.i++; else break }
        this.eat(')'); return fn(...args)
      }
      if (this.lang === 'py') return this.lookup(name)
      if (name in CONSTS && !this.scope.has(name)) return CONSTS[name] // `pi` in a Tcl expr is a variable-less constant
      return name
    }
    throw new ScriptError(`unexpected "${t.v}"`)
  }
  private lookup(name: string): Val {
    if (this.scope.has(name)) return this.scope.get(name)!
    if (this.lang === 'py' && name in CONSTS) return CONSTS[name]
    if (this.lang === 'py' && (name === 'True' || name === 'False')) return name === 'True' ? 1 : 0
    throw new ScriptError(`"${name}" has no known value`)
  }
}

/** Evaluates an arithmetic / literal expression against the constants seen so far. Nothing else is executed. */
export function evalExpr(src: string, scope: Scope, lang: Lang): Val {
  const p = new Parser(tokenize(src, lang), scope, lang)
  const v = p.expr()
  if (!p.done()) throw new ScriptError(`unexpected "${p.peek().v}"`)
  return v
}

/** A comma-separated call-argument list (Python): `*list` expands in place. */
export function evalArgs(src: string, scope: Scope, lang: Lang): Val[] {
  const toks = tokenize(src, lang)
  const p = new Parser(toks, scope, lang)
  const out: Val[] = []
  while (!p.done()) {
    const star = p.isOp('*')
    if (star) p.i++
    const v = p.expr()
    if (star) { if (!Array.isArray(v)) throw new ScriptError('"*" needs a list'); out.push(...v) } else out.push(v)
    if (p.isOp(',')) p.i++
    else if (!p.done()) throw new ScriptError(`unexpected "${p.peek().v}"`)
  }
  return out
}

export function isAssignment(src: string): { name: string; rhs: string } | null {
  const m = src.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.*)$/s)
  return m ? { name: m[1], rhs: m[2] } : null
}

export function flatten(v: Val[]): (number | string)[] {
  return v.flatMap((x) => (Array.isArray(x) ? flatten(x) : [x]))
}
