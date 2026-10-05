/// <reference types="node" />
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A real OpenSeesPy (the repo's `.venv`) for tests that check what we print is what OpenSees accepts. Tests skip when it isn't there. */
const PY = join(process.cwd(), '.venv/bin/python')
export const opensesAvailable = (() => {
  if (!existsSync(PY)) return false
  try { execFileSync(PY, ['-c', 'import openseespy.opensees'], { stdio: 'ignore' }); return true } catch { return false }
})()

/** Benign stderr from OpenSees itself; anything else mentioning a failure means the script was not accepted. */
const FAILURE = /error|unknown|invalid|not found|failed/i
const ALLOWED = /can't set handler after analysis is created/

/** Runs a script (an `out/` directory exists in its cwd) and reports whether OpenSees accepted it: exit 0 and no failure text on either stream. */
export function runOpenSees(script: string) {
  const dir = mkdtempSync(join(tmpdir(), 'pysees-ops-'))
  mkdirSync(join(dir, 'out'))
  writeFileSync(join(dir, 'm.py'), `${script}\nprint('@@', len(ops.getNodeTags()), len(ops.getEleTags()))\n`)
  const r = spawnSync(PY, ['m.py'], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  const output = `${r.stdout}\n${r.stderr}`
  const failures = output.split('\n').filter((l) => FAILURE.test(l) && !ALLOWED.test(l))
  // Whatever the recorders wrote, by file name (`out/disp.out` -> `disp.out`).
  const files: Record<string, string> = {}
  for (const f of readdirSync(join(dir, 'out'))) files[f] = readFileSync(join(dir, 'out', f), 'utf8')
  return { ok: r.status === 0 && failures.length === 0, stdout: r.stdout, stderr: r.stderr, failures, files }
}
