import type { CarapaceInputV1 } from '@/app/types/carapaceInputV1'
import type { CarapaceRunResult } from '@/app/types/carapaceRun'

/** pysees-handoff.md's worker protocol: coarse, run-oriented messages, each carrying a runId so
 * the UI can ignore responses for a run it's no longer displaying. Results stay in-memory for
 * now — no SQLite/OPFS yet (see results-storage-turso.md; storage backend is still undecided). */
type InMsg =
  | { type: 'run'; runId: string; input: CarapaceInputV1 }
  | { type: 'cancel'; runId: string }

type OutMsg =
  | { type: 'accepted'; runId: string }
  | { type: 'progress'; runId: string; stagesRun: string[]; currentStageId: string | undefined; stepsTaken: number }
  | { type: 'complete'; runId: string; result: CarapaceRunResult }
  | { type: 'cancelled'; runId: string }
  | { type: 'error'; runId: string; error: string }

const ctx = self as unknown as {
  postMessage: (msg: OutMsg) => void
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
}

const STEP_BUDGET = 64
const PROGRESS_INTERVAL_MS = 100

let wasmModule: typeof import('@/app/carapace/wasm/carapace_wasm.js') | null = null
async function loadWasm() {
  if (!wasmModule) {
    const mod = await import('@/app/carapace/wasm/carapace_wasm.js')
    await mod.default()
    wasmModule = mod
  }
  return wasmModule
}

/** Yields to the worker's event loop between advance() calls so a queued `cancel` message (a
 * macrotask, like this one) gets a chance to run — a microtask (bare `await Promise.resolve()`)
 * would not. This is the concrete "check for a pending cancel between calls" step the handoff
 * doc's cooperative-cancellation design describes. */
function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

const cancelledRuns = new Set<string>()

async function runOne(runId: string, input: CarapaceInputV1) {
  const { decodeInput } = await loadWasm()
  const session = decodeInput(input)

  const stagesRun: string[] = []
  let error: CarapaceRunResult['error'] = null
  let lastProgressAt = 0

  for (;;) {
    if (cancelledRuns.has(runId)) {
      cancelledRuns.delete(runId)
      ctx.postMessage({ type: 'cancelled', runId })
      return
    }
    const stageId = session.currentStageId()
    if (stageId && stagesRun[stagesRun.length - 1] !== stageId) stagesRun.push(stageId)
    const outcome = session.advance(STEP_BUDGET)
    if (outcome.error) { error = outcome.error; break }

    const now = Date.now()
    if (now - lastProgressAt > PROGRESS_INTERVAL_MS) {
      ctx.postMessage({ type: 'progress', runId, stagesRun: [...stagesRun], currentStageId: session.currentStageId(), stepsTaken: outcome.stepsTaken })
      lastProgressAt = now
    }
    if (outcome.done) break
    await yieldToEventLoop()
  }

  const recorderSamples: [number, number][][] = input.sequence.recorders.map((_, i) => session.recorderSamples(i))
  const result: CarapaceRunResult = { stagesRun, finalStageId: session.currentStageId(), error, recorderSamples }
  ctx.postMessage({ type: 'complete', runId, result })
}

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'run') {
    ctx.postMessage({ type: 'accepted', runId: msg.runId })
    runOne(msg.runId, msg.input).catch((error) => ctx.postMessage({ type: 'error', runId: msg.runId, error: String(error) }))
  } else if (msg.type === 'cancel') {
    cancelledRuns.add(msg.runId)
  }
}
