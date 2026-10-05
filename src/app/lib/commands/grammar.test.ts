import { describe, expect, it } from 'vitest'
import type { ArgDef } from '@/app/types/schema'
import { getAvailableSchemas } from '@/app/lib/commandSchemas'
import { decodeArgs, encodeArgs } from '@/app/lib/commands/grammar'
import type { Tok } from '@/app/lib/commands/tokens'

let CTX = { ndm: 2, ndf: 3 }
const isLit = (a: ArgDef) => a.kind === 'str' && a.name === 'literal'

/** Every token sequence a schema's arg tree can produce: one per combination of choice options, all flag segments present, in schema order. */
function samples(args: ArgDef[], n: { v: number }): Tok[][] {
  let acc: Tok[][] = [[]]
  const push = (parts: Tok[][]) => { acc = acc.flatMap((a) => parts.map((p) => [...a, ...p])) }
  // An arg that counts a later vec holds 2 in every sample, and that vec then has 2 * times values.
  const counts = new Set(args.flatMap((a) => (a.kind === 'vec' && typeof a.length === 'object' ? [a.length.ref] : [])))
  for (const a of args) {
    const named = 'name' in a ? a.name : ''
    if (counts.has(named) && a.kind !== 'vec') push([[2]])
    else if (a.kind === 'int') push([[n.v++]])
    else if (a.kind === 'float') push([[n.v++ + 0.5]])
    else if (a.kind === 'str') push([[isLit(a) ? String((a as { defaultValue?: string }).defaultValue) : a.word ? 'word' : n.v++ + 0.25]])
    else if (a.kind === 'vec') {
      const len = a.length === 'ndm' ? CTX.ndm : a.length === 'ndf' ? CTX.ndf : a.length === 'dynamic' ? 2 : typeof a.length === 'object' ? 2 * (a.length.times ?? 1) : a.length
      push([Array.from({ length: len }, () => n.v++ + 0.75)])
    }
    else if (a.kind === 'choice') push(a.options.filter((o) => o !== 'user-supplied').flatMap((o) => samples(a.yields[o] ?? [], n).map((rest) => [o, ...rest])))
  }
  return acc
}

/** A list the values bag can't hold losslessly: a dynamic vec followed by another positional value can't be split when read back, and
 * two args sharing a name overwrite each other. Both mean the generated schema under-specifies the command. */
function ambiguous(args: ArgDef[]): boolean {
  let seenDynamic = false
  const names = args.filter((a) => !isLit(a) && a.kind !== 'flag').map((a) => (a.kind === 'choice' ? a.name : (a as { name: string }).name))
  if (new Set(names).size !== names.length) return true
  for (const a of args) {
    if (isLit(a)) { seenDynamic = false; continue }
    if (seenDynamic && a.kind !== 'choice' && !(a.kind === 'str' && a.word)) return true
    if (a.kind === 'vec' && a.length === 'dynamic') seenDynamic = true
    else if (a.kind === 'choice' && Object.values(a.yields).some(ambiguous)) return true
  }
  return false
}

/** One entry per command, or per type for commands that start with a type choice (`uniaxialMaterial/Steel01`), so one ambiguous type doesn't hide the rest. */
function variants(fn: string, args: ArgDef[]): { name: string; args: ArgDef[] }[] {
  const k = args.findIndex((a) => a.kind === 'choice')
  if (k < 0) return [{ name: fn, args }]
  const choice = args[k] as Extract<ArgDef, { kind: 'choice' }>
  return choice.options.filter((o) => o !== 'user-supplied').map((o) => ({ name: `${fn}/${o}`, args: args.map((a, i) => (i === k ? { ...choice, options: [o], yields: { [o]: choice.yields[o] ?? [] } } : a)) }))
}

describe.each([2, 3] as const)('grammar: decodeArgs / encodeArgs over every generated command in %iD', (ndm) => {
  CTX = { ndm, ndf: ndm === 2 ? 3 : 6 }
  const schemas = getAvailableSchemas(ndm).filter((s) => s.cmd.startsWith('OPS:'))
  const all = schemas.flatMap((s) => variants(s.fn, s.args))
  const bad: string[] = []
  const unsound: string[] = []
  let checked = 0
  for (const v of all) {
    if (ambiguous(v.args)) { unsound.push(v.name); continue }
    for (const tokens of samples(v.args, { v: 1 })) {
      checked++
      const { values, consumed, problems } = decodeArgs(v.args, tokens, CTX)
      const back = encodeArgs(v.args, values, CTX)
      if (problems.length || consumed !== tokens.length || JSON.stringify(back) !== JSON.stringify(tokens)) { bad.push(`${v.name}: ${JSON.stringify(tokens)} -> ${JSON.stringify(back)} ${problems.join(';')}`); break }
    }
  }

  it('covers the whole command menu', () => { expect(schemas.length).toBeGreaterThan(100); expect(checked).toBeGreaterThan(all.length * 0.8) })
  it('decode then encode reproduces every sample exactly', () => { expect(bad).toEqual([]) })
  // A command that can't be read back losslessly needs an entry in scripts/schema-patches.json (or a generator fix), not an allowlist here.
  it('has no command variant whose generated schema is ambiguous', () => { expect(unsound.sort()).toEqual([]) })
})

describe('encodeArgs', () => {
  it('never emits a dangling flag', () => {
    const ts = getAvailableSchemas(2).find((s) => s.fn === 'timeSeries')!
    expect(encodeArgs(ts.args, { type: 'Linear', tag: 3 }, CTX)).toEqual(['Linear', 3])
    expect(encodeArgs(ts.args, { type: 'Linear', tag: 3, factor: 2 }, CTX)).toEqual(['Linear', 3, '-factor', 2])
  })
  it('keeps numbers stored in string-typed fields', () => {
    const p = getAvailableSchemas(2).find((s) => s.fn === 'pattern')!
    expect(encodeArgs(p.args, { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1.5 }, CTX)).toEqual(['Plain', 1, 1, '-fact', 1.5])
  })
})
