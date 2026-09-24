import type { CarapaceInputV1 } from '@/app/types/carapaceInputV1'

export interface CarapaceRunResult {
  stagesRun: string[]
  finalStageId: string | undefined
  error: { kind: string; [key: string]: unknown } | null
  /** samples[recorderIndex] = [pseudoTime, value][] */
  recorderSamples: [number, number][][]
}

const STEP_BUDGET = 64

let wasmModule: typeof import('@/app/carapace/wasm/carapace_wasm.js') | null = null
async function loadWasm() {
  if (!wasmModule) {
    const mod = await import('@/app/carapace/wasm/carapace_wasm.js')
    await mod.default()
    wasmModule = mod
  }
  return wasmModule
}

/** Decodes a compiled CarapaceInputV1 and steps it to completion (or first error), collecting every
 * recorder's full sample history. Runs entirely on the main thread for now — see pysees-handoff.md's
 * worker protocol for where this belongs once a "Run" UI needs to stay responsive on larger models. */
export async function runCarapace(input: CarapaceInputV1): Promise<CarapaceRunResult> {
  const { decodeInput } = await loadWasm()
  const session = decodeInput(input)
  const stagesRun: string[] = []
  let error: CarapaceRunResult['error'] = null

  for (;;) {
    const stageId = session.currentStageId()
    if (stageId && stagesRun[stagesRun.length - 1] !== stageId) stagesRun.push(stageId)
    const outcome = session.advance(STEP_BUDGET)
    if (outcome.error) { error = outcome.error; break }
    if (outcome.done) break
  }

  const recorderSamples: [number, number][][] = input.sequence.recorders.map((_, i) => session.recorderSamples(i))
  return { stagesRun, finalStageId: session.currentStageId(), error, recorderSamples }
}
