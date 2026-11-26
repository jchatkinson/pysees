/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CaseResult } from './types'

/** Where the generator writes: page data (bundled with the site) and downloads (served as-is). */
export const DATA_DIR = join(process.cwd(), 'src/marketing/verification/data')
export const PUBLIC_DIR = join(process.cwd(), 'public/verification')
/** Files that define cases: their lines are what the page links. */
export const CASE_FILES = ['src/app/lib/verification/cases.ts', 'src/app/lib/verification/newCases.ts']
const WASM = join(process.cwd(), 'src/app/carapace/wasm')

export type IndexRow = Omit<CaseResult, 'plots' | 'metrics' | 'modal' | 'problems'> & { source: { file: string; line: number } }
export interface VerificationIndex {
  generated: string
  pysees: { commit: string }
  carapace: { commit: string; wasmSha256: string }
  opensees: { package: string; version: string }
  cases: IndexRow[]
}

export const pinnedOpenSees = () => /openseespy==([\w.]+)/.exec(readFileSync(join(process.cwd(), 'requirements-verify.txt'), 'utf8'))![1]
export function installedOpenSees(): string | null {
  try { return execFileSync(join(process.cwd(), '.venv/bin/python'), ['-c', "import importlib.metadata as m; print(m.version('openseespy'))"], { encoding: 'utf8' }).trim() } catch { return null }
}

export const wasmSha256 = () => createHash('sha256').update(readFileSync(join(WASM, 'carapace_wasm_bg.wasm'))).digest('hex')
/** The Carapace commit the bundled wasm was built from (`scripts/build-carapace.sh`), and whether the wasm is still that build. */
export function wasmBuild() {
  const path = join(WASM, 'build-info.json')
  const info = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as { commit: string; dirty: boolean; wasmSha256: string } : { commit: 'unknown', dirty: true, wasmSha256: '' }
  return { info, matches: info.wasmSha256 === wasmSha256() }
}

/** The file and line that define a case (`id: '<id>'`, or the template literal a group of cases is mapped from). */
export function caseLine(id: string): { file: string; line: number } {
  for (const file of CASE_FILES) {
    const lines = readFileSync(join(process.cwd(), file), 'utf8').split('\n')
    let i = lines.findIndex((l) => l.includes(`id: '${id}'`))
    if (i < 0) i = lines.findIndex((l) => l.includes(`id: \`${id.slice(0, id.indexOf('-') + 1)}\${`))
    if (i >= 0) return { file, line: i + 1 }
  }
  return { file: CASE_FILES[0], line: 1 }
}
