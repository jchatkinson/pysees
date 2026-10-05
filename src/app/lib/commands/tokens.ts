/** The language-neutral form of an OpenSees command: Tcl and OpenSeesPy share one positional argument sequence. */
export type Tok = number | string

/** `body` holds a block's child commands (Tcl `pattern … { load … }`; OpenSeesPy prints them as following calls). */
export interface Call { fn: string; args: Tok[]; body?: Call[]; comment?: string }

/** A command that cannot be represented; the importer reports it and moves on. */
export class Skip extends Error {}
export const skip = (message: string): never => { throw new Skip(message) }

export const isNum = (t: Tok | undefined): t is number => typeof t === 'number'
export const isFlag = (t: Tok | undefined): t is string => typeof t === 'string' && t.startsWith('-')

/** Leading run of numbers starting at `i`. */
export function numsFrom(t: Tok[], i: number): number[] {
  const out: number[] = []
  for (; isNum(t[i]); i++) out.push(t[i] as number)
  return out
}

/** Reads `n` numbers at `i`, or skips the command naming what was expected. */
export function need(t: Tok[], i: number, n: number, what: string): number[] {
  const got = numsFrom(t, i).slice(0, n)
  return got.length === n ? got : skip(`expected ${what} (${n} numbers), found ${got.length}`)
}

export const tag = (v: Tok | undefined, what: string): number => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : skip(`${what} must be a positive integer`))
