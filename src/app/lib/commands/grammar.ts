import type { ArgDef, SchemaContext } from '@/app/types/schema'
import { isNum, type Tok } from '@/app/lib/commands/tokens'

/**
 * The arg-tree grammar behind every schema-described command, in both directions: `decodeArgs` reads positional tokens
 * into a values bag and `encodeArgs` writes a values bag back to positional tokens. They are inverses by construction
 * (see grammar.test.ts), and both import / export and the command forms go through them.
 */

const isLiteral = (a: ArgDef) => a.kind === 'str' && a.name === 'literal'
const literalOf = (a: ArgDef) => String((a as { defaultValue?: string }).defaultValue ?? '')
/** A vec's length, or 'dynamic' when it is open-ended or counted by an arg that has no value yet. */
function vecLen(a: Extract<ArgDef, { kind: 'vec' }>, ctx: SchemaContext, values: Record<string, unknown>): number | 'dynamic' {
  if (a.length === 'ndm') return ctx.ndm
  if (a.length === 'ndf') return ctx.ndf
  if (typeof a.length === 'object') {
    const count = Number(values[a.length.ref])
    return Number.isInteger(count) && count >= 0 ? count * (a.length.times ?? 1) : 'dynamic'
  }
  return a.length
}

/** Splits a list at its `literal` flags: the leading positional args, then `-flag value…` segments. */
function segments(args: ArgDef[]) {
  const first = args.findIndex(isLiteral)
  const head = first < 0 ? args : args.slice(0, first)
  const segs: { lit: string; args: ArgDef[] }[] = []
  for (const a of first < 0 ? [] : args.slice(first)) { if (isLiteral(a)) segs.push({ lit: literalOf(a), args: [] }); else segs[segs.length - 1].args.push(a) }
  return { head, segs }
}

export interface Decoded { values: Record<string, unknown>; consumed: number; problems: string[] }

/** Reads positional tokens through a schema's arg tree. Trailing `-flag value…` segments may come in any order. */
export function decodeArgs(args: ArgDef[], t: Tok[], ctx: SchemaContext): Decoded {
  const values: Record<string, unknown> = {}
  const problems: string[] = []
  const p = { i: 0 }
  fill(args, t, p, values, ctx, problems)
  return { values, consumed: p.i, problems }
}

function fill(args: ArgDef[], t: Tok[], p: { i: number }, out: Record<string, unknown>, ctx: SchemaContext, problems: string[]) {
  const { head, segs } = segments(args)
  const stops = new Set(segs.map((s) => s.lit))
  const take = (a: ArgDef) => {
    if (p.i >= t.length) return
    const tok = t[p.i]
    if (a.kind === 'int' || a.kind === 'float') {
      if (!isNum(tok)) return
      out[a.name] = a.kind === 'int' ? Math.trunc(tok) : tok; p.i++
    } else if (a.kind === 'str') {
      if (typeof tok === 'string' && stops.has(tok)) return
      out[a.name] = tok; p.i++
    } else if (a.kind === 'vec') {
      const len = vecLen(a, ctx, out)
      const vals: number[] = []
      while (isNum(t[p.i]) && (len === 'dynamic' || vals.length < len)) vals.push(t[p.i++] as number)
      if (vals.length || len !== 'dynamic') out[a.name] = vals // an absent open-ended list carries no information
    } else if (a.kind === 'choice') {
      const opt = typeof tok === 'string' ? a.options.find((o) => o.toLowerCase() === tok.toLowerCase()) : undefined
      if (!opt) { problems.push(`unknown ${a.name} "${tok}"`); p.i = t.length; return }
      out[a.name] = opt; p.i++
      fill(a.yields[opt] ?? [], t, p, out, ctx, problems)
    } else if (a.kind === 'flag') {
      if (tok !== a.flag) return
      out[a.flag] = true; p.i++
      fill(a.args, t, p, out, ctx, problems)
    }
  }
  for (const a of head) take(a)
  while (p.i < t.length && typeof t[p.i] === 'string') {
    const seg = segs.find((s) => s.lit === t[p.i])
    if (!seg) break
    p.i++
    if (!seg.args.length) out[seg.lit] = true // a bare flag (`-append`) has no value to carry its presence
    for (const a of seg.args) take(a)
  }
}

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback }

function encodeOne(arg: ArgDef, values: Record<string, unknown>, ctx: SchemaContext, fallbackMatTag: number, optional = false): Tok[] {
  if (arg.kind === 'int') {
    const rawValue = values[arg.name]
    if ((rawValue === undefined || rawValue === null || rawValue === '') && arg.name !== 'matTag') return []
    const raw = Number(rawValue ?? arg.defaultValue)
    const n = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : (arg.name === 'matTag' ? fallbackMatTag : NaN)
    return Number.isFinite(n) ? [n] : []
  }
  if (arg.kind === 'float') {
    const rawValue = values[arg.name]
    if (rawValue === undefined || rawValue === null || rawValue === '') return []
    const n = Number(rawValue ?? arg.defaultValue)
    return Number.isFinite(n) ? [n] : []
  }
  if (arg.kind === 'str') {
    const v = values[arg.name]
    const s = typeof v === 'string' ? v : typeof v === 'number' ? v : typeof arg.defaultValue === 'string' ? arg.defaultValue : undefined
    if (s === undefined) return []
    if (typeof s === 'number') return [s]
    const trimmed = s.trim()
    if (trimmed.length === 0) return []
    const n = Number(trimmed)
    return Number.isFinite(n) ? [n] : [s]
  }
  if (arg.kind === 'vec') {
    // Zero-padding a required fixed-length vec keeps its position; in an optional flag segment an absent vec means the flag isn't used.
    if (optional && !Array.isArray(values[arg.name])) return []
    const v = Array.isArray(values[arg.name]) ? (values[arg.name] as unknown[]) : []
    const len = typeof arg.length === 'object' ? 'dynamic' : vecLen(arg, ctx, values) // a counted list is written as stored
    return len === 'dynamic' ? v.map((x) => num(x)) : Array.from({ length: len }, (_, i) => num(v[i]))
  }
  if (arg.kind === 'flag') return values[arg.flag] ? [arg.flag, ...encodeArgs(arg.args, values, ctx, fallbackMatTag)] : []
  if (arg.kind === 'choice') {
    const selected = String(values[arg.name] ?? arg.defaultValue ?? arg.options[0] ?? '')
    return [selected, ...encodeArgs(arg.yields[selected] ?? [], values, ctx, fallbackMatTag)]
  }
  if (arg.kind === 'idlist') {
    const ids = Array.isArray(values[arg.name]) ? (values[arg.name] as unknown[]) : []
    return ids.length ? [Math.trunc(num(ids[0]))] : []
  }
  return []
}

/** Writes a values bag as positional tokens. A `-flag` is emitted when the values after it are present (never dangling), or, for a bare flag, when its value is `true`. */
export function encodeArgs(args: ArgDef[], values: Record<string, unknown>, ctx: SchemaContext, fallbackMatTag = 1): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < args.length;) {
    const a = args[i]
    if (!isLiteral(a)) { out.push(...encodeOne(a, values, ctx, fallbackMatTag)); i++; continue }
    let j = i + 1
    while (j < args.length && !isLiteral(args[j])) j++
    const seg = args.slice(i + 1, j).flatMap((c) => encodeOne(c, values, ctx, fallbackMatTag, true))
    if (j === i + 1 ? values[literalOf(a)] === true : seg.length) out.push(literalOf(a), ...seg)
    i = j
  }
  return out
}
