/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CASES } from './cases'
import { DATA_DIR, PUBLIC_DIR, pinnedOpenSees, wasmSha256, type VerificationIndex } from './files'
import type { CaseResult } from './types'

const REGENERATE = 'regenerate it: VERIFY=1 npx vitest run src/app/lib/verification/generate.test.ts, then node scripts/verification-screenshots.mjs'

/** The committed verification page data must describe the cases, engines and OpenSees version in the repo now. Needs no OpenSees. */
describe('verification page data is current', () => {
  const index = JSON.parse(readFileSync(join(DATA_DIR, 'index.json'), 'utf8')) as VerificationIndex

  it('covers exactly the registered cases', () => {
    expect(index.cases.map((c) => c.id).sort(), REGENERATE).toEqual(CASES.map((c) => c.id).sort())
  })

  it('was generated from the bundled wasm and the pinned OpenSeesPy', () => {
    expect(index.carapace.wasmSha256, `the bundled wasm changed since the page was generated; ${REGENERATE}`).toBe(wasmSha256())
    expect(index.opensees.version, `requirements-verify.txt pins a different OpenSeesPy; ${REGENERATE}`).toBe(pinnedOpenSees())
  })

  it.each(CASES.map((c) => c.id))('%s: agrees within its tolerance, with its files and screenshots', (id) => {
    const result = JSON.parse(readFileSync(join(DATA_DIR, `${id}.json`), 'utf8')) as CaseResult
    expect(result.problems).toEqual([])
    expect(result.pass).toBe(true)
    for (const f of [`${id}.py`, `${id}.pysees.py`, `${id}-model.webp`, `${id}-result.webp`]) expect(existsSync(join(PUBLIC_DIR, f)), `public/verification/${f} is missing; ${REGENERATE}`).toBe(true)
  })
})
