/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { serializeProject } from '@/app/lib/project/serialize'
import { captureProject } from '@/app/lib/project/types'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'
import { CASES } from './cases'
import { verifyCase } from './verify'
import { CASE_FILES, DATA_DIR, PUBLIC_DIR, caseLine, installedOpenSees, pinnedOpenSees, wasmBuild, type IndexRow, type VerificationIndex } from './files'

/**
 * Writes the verification page's data: every case run in Carapace and in the pinned OpenSeesPy, its measurements and downsampled plots
 * (`src/marketing/verification/data`), plus the exported script and the PySees project (`public/verification`). Run with
 * `VERIFY=1 npx vitest run src/app/lib/verification/generate.test.ts`, after committing the cases (the page links each case at the commit
 * recorded here), then capture the screenshots (`node scripts/verification-screenshots.mjs`).
 */
describe.runIf(process.env.VERIFY)('verification page data', () => {
  it('writes every case', () => {
    const pinned = pinnedOpenSees(), installed = installedOpenSees()
    expect(installed, `OpenSeesPy ${installed} is installed; the page is generated with the pinned ${pinned} (requirements-verify.txt)`).toBe(pinned)
    const build = wasmBuild()
    expect(build.matches, 'the bundled wasm differs from build-info.json; rebuild it with scripts/build-carapace.sh').toBe(true)
    const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
    const dirty = git(['status', '--porcelain', '--', ...CASE_FILES]) !== ''
    if (dirty) console.warn('Case files have uncommitted changes: the page will link a commit that does not contain them.')

    mkdirSync(DATA_DIR, { recursive: true }); mkdirSync(PUBLIC_DIR, { recursive: true })
    for (const dir of [DATA_DIR, PUBLIC_DIR]) for (const f of readdirSync(dir)) if (/\.(json|py)$/.test(f)) rmSync(join(dir, f))
    const index: VerificationIndex = {
      generated: new Date().toISOString().slice(0, 10),
      pysees: { commit: git(['rev-parse', 'HEAD']) },
      carapace: { commit: build.info.commit, wasmSha256: build.info.wasmSha256 },
      opensees: { package: 'openseespy', version: installed ?? 'none' },
      cases: [],
    }
    for (const c of CASES) {
      const { result, script } = verifyCase(c)
      const built = c.build()
      const line = caseLine(c.id)
      writeFileSync(join(DATA_DIR, `${c.id}.json`), JSON.stringify({ ...result, source: line }) + '\n')
      writeFileSync(join(PUBLIC_DIR, `${c.id}.py`), script)
      const doc = captureProject({
        model: built.model, analysisHistory: built.history, gridlines: built.gridlines ?? [], levels: built.levels ?? [],
        nextGridlineId: (built.gridlines?.length ?? 0) + 1, nextLevelId: (built.levels?.length ?? 0) + 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null,
        viewSettings: {}, unitPrefs: {}, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW,
      })
      writeFileSync(join(PUBLIC_DIR, `${c.id}.pysees.py`), serializeProject(doc))
      const row = Object.fromEntries(Object.entries(result).filter(([k]) => !['plots', 'metrics', 'modal', 'problems'].includes(k))) as IndexRow
      index.cases.push({ ...row, source: line })
    }
    writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 1) + '\n')
    // Every case should agree within its tolerance; a failing one is still written so the page can be inspected, but this run fails.
    expect(index.cases.filter((c) => !c.pass).map((c) => `${c.id}: ${JSON.parse(readFileSync(join(DATA_DIR, `${c.id}.json`), 'utf8')).problems.join('; ')}`)).toEqual([])
  }, 600_000)
})
