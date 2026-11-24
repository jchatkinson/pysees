/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { compileInputV1, type CompileInputV1Result } from '@/app/lib/carapace/compileInputV1'
import type { Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import { recorderRows, type RecorderOutput } from '@/app/lib/resultsStorage/recorderRows'

let ready = false
function loadCarapace() {
  if (!ready) { wasm.initSync({ module: readFileSync(join(process.cwd(), 'src/app/carapace/wasm/carapace_wasm_bg.wasm')) }); ready = true }
  return wasm
}

export interface CarapaceRun {
  compile: CompileInputV1Result
  /** One entry per stored column (`recorderPlans`' `columnOffset`s), each with one value per step, in step order. */
  columns: number[][]
  /** Pseudo-time of each step. */
  times: number[]
  /** Each stage's initial-conditions row (recorded before its first step), by wire stage index: not part of `columns`, which — like OpenSees' recorders — hold only the steps. */
  initial: Map<number, number[]>
  error: unknown
}

interface Outcome extends RecorderOutput { done: boolean; error: unknown }

/** Compiles a model + analysis history exactly as the app does and runs it to the end in the same wasm engine, collecting every recorded step. */
export function runCarapace(model: Model, history: AnalysisHistory): CarapaceRun {
  const compile = compileInputV1(model, history)
  if (!compile.input) throw new Error(`Carapace could not compile this model: ${compile.diagnostics.map((d) => d.message).join('; ')}`)
  const { width } = compile.rowLayout, stride = 1 + width
  const session = loadCarapace().decodeInput(compile.input as never)
  const columns: number[][] = Array.from({ length: width }, () => [])
  const times: number[] = []
  const initial = new Map<number, number[]>()
  let error: unknown = null
  for (;;) {
    const o = session.advance(64) as Outcome
    const rows = recorderRows(o, compile.rowLayout, compile.input.sequence.stages)
    for (let f = 0; f < (rows?.count ?? 0); f++) {
      const row = rows!.data.subarray(f * stride, (f + 1) * stride)
      // The first row a stage produces is its initial condition (the run records them).
      if (!initial.has(rows!.stageIndex)) { initial.set(rows!.stageIndex, [...row.subarray(1)]); continue }
      times.push(row[0])
      for (let c = 0; c < width; c++) columns[c].push(row[1 + c])
    }
    if (o.error) { error = o.error; break }
    if (o.done) break
  }
  return { compile, columns, times, initial, error }
}

/** Compiles and runs a model + analysis history exactly as the app does, then returns every finished modal stage's results. */
export function runCarapaceModal(model: Model, history: AnalysisHistory) {
  const compile = compileInputV1(model, history)
  if (!compile.input) throw new Error(`Carapace could not compile this model: ${compile.diagnostics.map((d) => d.message).join('; ')}`)
  const session = loadCarapace().decodeInput(compile.input as never)
  let error: unknown = null
  for (;;) {
    const o = session.advance(64) as Outcome
    if (o.error) { error = o.error; break }
    if (o.done) break
  }
  return { compile, error, stages: session.modalResults().stages }
}
