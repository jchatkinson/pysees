/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { compileInputV1, type CompileInputV1Result } from '@/app/lib/carapace/compileInputV1'
import type { Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'

let ready = false
function loadCarapace() {
  if (!ready) { wasm.initSync({ module: readFileSync(join(process.cwd(), 'src/app/carapace/wasm/carapace_wasm_bg.wasm')) }); ready = true }
  return wasm
}

export interface CarapaceRun {
  compile: CompileInputV1Result
  /** One entry per wire recorder (a scalar column), each with one value per step, in step order. */
  columns: number[][]
  /** Pseudo-time of each step. */
  times: number[]
  /** Each stage's initial-conditions sample (recorded before its first step), by wire stage index then wire recorder: not part of `columns`, which — like OpenSees' recorders — hold only the steps. */
  initial: Map<number, number[]>
  error: unknown
}

interface Batch { recorderIndex: number; stageIndex: number; samples: [number, number][] }
interface Outcome { done: boolean; error: unknown; recorderBatches: Batch[] }

/** Compiles a model + analysis history exactly as the app does and runs it to the end in the same wasm engine, collecting every recorder sample. */
export function runCarapace(model: Model, history: AnalysisHistory): CarapaceRun {
  const compile = compileInputV1(model, history)
  if (!compile.input) throw new Error(`Carapace could not compile this model: ${compile.diagnostics.map((d) => d.message).join('; ')}`)
  const session = loadCarapace().decodeInput(compile.input)
  const columns: number[][] = compile.input.sequence.recorders.map(() => [])
  const times: number[] = []
  const initial = new Map<number, number[]>()
  const started = new Set<string>()
  let error: unknown = null
  for (;;) {
    const o = session.advance(64) as Outcome
    for (const b of o.recorderBatches) {
      b.samples.forEach(([t, v], k) => {
        // The first sample a recorder produces in a stage is its initial condition (the run records them).
        if (k === 0 && !started.has(`${b.stageIndex}:${b.recorderIndex}`)) {
          started.add(`${b.stageIndex}:${b.recorderIndex}`)
          const row = initial.get(b.stageIndex) ?? []
          row[b.recorderIndex] = v
          initial.set(b.stageIndex, row)
          return
        }
        columns[b.recorderIndex].push(v)
        if (b.recorderIndex === 0) times.push(t)
      })
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
  const session = loadCarapace().decodeInput(compile.input)
  let error: unknown = null
  for (;;) {
    const o = session.advance(64) as Outcome
    if (o.error) { error = o.error; break }
    if (o.done) break
  }
  return { compile, error, stages: session.modalResults().stages }
}
