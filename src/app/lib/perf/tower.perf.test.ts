/// <reference types="node" />
import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { towerTemplate } from '@/app/lib/templates'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { exportScript } from '@/app/lib/exportScript'
import { buildSceneIndex } from '@/app/components/r3f/sceneIndex'
import { readScriptFile } from '@/app/lib/project/open'
import { recorderRows, type RecorderOutput } from '@/app/lib/resultsStorage/recorderRows'

/** Stage timings for a large tower, run with `PERF=1 npx vitest run src/app/lib/perf`. Size from TOWER=stories,baysX,baysY,mesh. */
const [stories, baysX, baysY, mesh] = (process.env.TOWER ?? '20,6,4,4').split(',').map(Number)

describe.skipIf(!process.env.PERF)('tower stress test', () => {
  it(`${stories} stories, ${baysX}×${baysY} bays, mesh ${mesh}`, () => {
    const rows: [string, number, string][] = []
    const time = <T>(label: string, f: () => T, note: (r: T) => string = () => ''): T => {
      const t0 = performance.now(); const r = f(); const ms = performance.now() - t0
      rows.push([label, ms, note(r)]); return r
    }
    const t = time('template', () => towerTemplate({ stories, storyH: 4, baysX, bayX: 8, baysY, bayY: 8, mesh }), (t) => `${t.writes.length} writes`)
    const model = time('modelFromWrites', () => modelFromWrites(t.ndm, t.ndf, t.writes), (m) => `${m.nodes.size} nodes, ${m.elements.size} elements`)
    const history = { commands: t.analysisCommands, cursor: t.analysisCommands.length - 1 }
    time('buildSceneIndex', () => buildSceneIndex(model.nodes, model.elements, model.geomTransfs, 3), (s) => `${s.segmentCount} segments`)
    const c = time('compileInputV1', () => compileInputV1(model, history), (c) => `${c.input?.sequence.recorders.length} recorders, ${c.rowLayout.width} columns, ${(JSON.stringify(c.input).length / 1e6).toFixed(1)} MB input`)
    for (const d of c.diagnostics) console.log(d.severity, d.message)
    if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(c.input)) // for the native CLI: `carapace run <file>`
    const py = time('exportScript', () => exportScript(model, history, 'py'), (s) => `${(s.length / 1e6).toFixed(1)} MB`)
    time('import exported .py', () => readScriptFile(py, 'tower.py'), (r) => { for (const d of r.diagnostics) console.log('import', d.severity, d.message); return `${r.writes.length} writes` })
    wasm.initSync({ module: readFileSync(join(process.cwd(), 'src/app/carapace/wasm/carapace_wasm_bg.wasm')) })
    const session = time('wasm decodeInput', () => wasm.decodeInput(c.input! as never))
    let samples = 0, calls = 0
    const stageMs = new Map<number, number>()
    for (;;) {
      const t0 = performance.now()
      const o = session.advance(64) as RecorderOutput & { done: boolean; error: unknown }
      const ms = performance.now() - t0
      calls++
      const st = o.bulkBatches?.[0]?.stageIndex ?? o.recorderBatches[0]?.stageIndex ?? -1
      stageMs.set(st, (stageMs.get(st) ?? 0) + ms)
      for (const b of o.bulkBatches ?? []) samples += b.values.length
      if (st >= 0) {
        const t1 = performance.now()
        const r = recorderRows(o, c.rowLayout, c.input!.sequence.stages)
        rows.push([`recorderRows, stage ${st}`, performance.now() - t1, `${r?.count} rows × ${c.rowLayout.width + 1}`])
      }
      if (o.error) { console.log('error', o.error); break }
      if (o.done) break
    }
    for (const [st, ms] of stageMs) rows.push([`advance, stage ${st}`, ms, ''])
    rows.push(['advance total', [...stageMs.values()].reduce((a, b) => a + b, 0), `${calls} calls, ${samples} values`])
    console.log(rows.map(([l, ms, n]) => `${l.padEnd(22)} ${ms.toFixed(0).padStart(8)} ms  ${n}`).join('\n'))
  }, 3_600_000)
})
