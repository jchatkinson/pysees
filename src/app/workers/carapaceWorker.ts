import { recorderRows, type RecorderOutput, type RowLayout } from '@/app/lib/resultsStorage/recorderRows'
import type { CarapaceInputV1 } from '@/app/types/carapaceInputV1'
import type { CarapaceRunResult } from '@/app/types/carapaceRun'
import type { ModalStageResult, ResultBlock, StorageReply, StorageRequest } from '@/app/types/resultsStorage'

/** pysees-handoff.md's worker protocol: coarse, run-oriented messages, each carrying a runId so
 * the UI can ignore responses for a run it's no longer displaying. `storagePort`, when present,
 * is this run's dedicated side of a `MessageChannel` to the results-storage worker (see
 * carapace/docs/results-storage-indexeddb.md's "Use a MessageChannel between the two workers") —
 * the main thread creates the channel, keeps the other port for its own beginRun/finishRun calls,
 * and transfers this one when starting the run. `layout` (compileInputV1's `rowLayout`) says which
 * columns of the dense results-storage row each wire recorder's values fill. */
type InMsg =
  | { type: 'run'; runId: string; input: CarapaceInputV1; layout: RowLayout; storagePort?: MessagePort }
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
// Starting values for measurement, not API guarantees — results-storage-indexeddb.md's
// "Batching and backpressure" section.
const IN_FLIGHT_BYTE_BUDGET = 8 * 1024 * 1024
const FLUSH_BYTE_TARGET = 1 * 1024 * 1024

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

// The part of `carapace_wasm`'s `StepOutcome` this worker reads. `advance()` returns `any` at the TS boundary.
interface WasmStepOutcome extends RecorderOutput {
  done: boolean
  stageComplete: boolean
  stepsTaken: number
  loadFactor: number
  error: CarapaceRunResult['error']
}

/** Buffers `advance()` calls into dense, run-wide chunks — one row per step, every recorded
 * node's full displacement vector together (`[pseudoTime, node0.dof0.., node1.dof0.., ...]`) —
 * and flushes them to the results-storage worker as one `ResultBlock` per chunk. Flushes on a
 * byte-size target (results-storage-indexeddb.md's "Batching and backpressure": fewer, bigger
 * `put()`s beat one per `advance()` call), on a stage-index change (never mixes two stages in one
 * block), and unconditionally at run end/cancellation/error so no already-produced data is lost.
 * Also applies the doc's bounded in-flight-bytes backpressure: `flush` doesn't return until
 * enough prior writes have acked to bring the outstanding total back under budget. A
 * `storageError` reply is sticky — once one arrives, every later call (and the run) fails,
 * matching "storage failure is distinct from solver failure ... never mark such a run complete". */
export class StorageStream {
  private readonly stride: number
  private pending: Float64Array[] = []
  private pendingCount = 0
  private pendingFirstSample = 0
  private pendingStageIndex = 0
  private blockIndexCounter = 0
  private pendingAcks: { bytes: number; resolve: () => void }[] = []
  private inFlightBytes = 0
  private requestCounter = 0
  private failure: string | null = null

  private port: MessagePort
  private runId: string
  private nextSample = 0
  private layout: RowLayout
  private stages: CarapaceInputV1['sequence']['stages']

  constructor(port: MessagePort, runId: string, layout: RowLayout, stages: CarapaceInputV1['sequence']['stages']) {
    this.port = port; this.runId = runId; this.layout = layout; this.stages = stages
    this.stride = 1 + layout.width
    port.onmessage = (e: MessageEvent<StorageReply>) => this.onReply(e.data)
  }

  private onReply(reply: StorageReply) {
    if (reply.type !== 'writeBlocksAck' && reply.type !== 'writeModalAck' && reply.type !== 'storageError') return
    if (reply.type === 'storageError') this.failure = reply.detail
    const entry = this.pendingAcks.shift()
    if (entry) { this.inFlightBytes -= entry.bytes; entry.resolve() }
  }

  /** Adds one `advance()` call's steps, keeping a contiguous timeline across stages. */
  async add(out: RecorderOutput): Promise<void> {
    const rows = recorderRows(out, this.layout, this.stages)
    if (!rows?.count) return
    if (this.pendingCount > 0 && rows.stageIndex !== this.pendingStageIndex) await this.flush()
    if (this.pendingCount === 0) {
      this.pendingFirstSample = this.nextSample
      this.pendingStageIndex = rows.stageIndex
    }
    this.pending.push(rows.data)
    this.pendingCount += rows.count
    this.nextSample += rows.count
    if (this.pendingCount * this.stride * 8 >= FLUSH_BYTE_TARGET) await this.flush()
  }

  /** Persists finished modal stages (not part of the step timeline). Waits for the ack. */
  async writeModal(stages: ModalStageResult[]): Promise<void> {
    if (this.failure) throw new Error(this.failure)
    const requestId = `storage-${this.runId}-${this.requestCounter++}`
    const ack = new Promise<void>((resolve) => this.pendingAcks.push({ bytes: 0, resolve }))
    const request: StorageRequest = { type: 'writeModal', requestId, runId: this.runId, stages }
    this.port.postMessage(request)
    await ack
    if (this.failure) throw new Error(this.failure)
  }

  async flush(): Promise<void> {
    if (this.pendingCount === 0) return
    if (this.failure) throw new Error(this.failure)

    const chunks = this.pending, sampleCount = this.pendingCount
    const firstSample = this.pendingFirstSample
    const stageIndex = this.pendingStageIndex
    this.pending = []
    this.pendingCount = 0

    let data = chunks[0]
    if (chunks.length > 1) {
      data = new Float64Array(sampleCount * this.stride)
      let at = 0
      for (const c of chunks) { data.set(c, at); at += c.length }
    }
    const block: ResultBlock = { blockIndex: this.blockIndexCounter++, firstSample, sampleCount, stageIndex, data: data.buffer as ArrayBuffer }
    const bytes = data.buffer.byteLength

    const requestId = `storage-${this.runId}-${this.requestCounter++}`
    const ackPromise = new Promise<void>((resolve) => this.pendingAcks.push({ bytes, resolve }))
    this.inFlightBytes += bytes
    const request: StorageRequest = { type: 'writeBlocks', requestId, runId: this.runId, batchId: requestId, blocks: [block] }
    this.port.postMessage(request, [block.data as ArrayBuffer])

    if (this.inFlightBytes > IN_FLIGHT_BYTE_BUDGET) await ackPromise
    if (this.failure) throw new Error(this.failure)
  }
}

async function runOne(runId: string, input: CarapaceInputV1, layout: RowLayout, storagePort?: MessagePort) {
  const { decodeInput } = await loadWasm()
  const session = decodeInput(input)
  const storageStream = storagePort ? new StorageStream(storagePort, runId, layout, input.sequence.stages) : null

  const stagesRun: string[] = []
  let error: CarapaceRunResult['error'] = null
  let lastProgressAt = 0
  let sampleCount = 0

  let modalStageCount = 0
  const finalizeStorage = async () => {
    if (!storageStream) return
    try {
      await storageStream.flush()
      // Modes of every modal stage that finished — kept even if a later stage failed or the run was cancelled.
      const modal = (session.modalResults() as { stages: ModalStageResult[] }).stages
      if (modal.length) await storageStream.writeModal(modal)
      modalStageCount = modal.length
    } catch (storageError) { error = { kind: 'storageFailed', detail: String(storageError) } }
  }

  for (;;) {
    if (cancelledRuns.has(runId)) {
      cancelledRuns.delete(runId)
      await finalizeStorage()
      ctx.postMessage({ type: 'cancelled', runId })
      return
    }
    const stageId = session.currentStageId()
    if (stageId && stagesRun[stagesRun.length - 1] !== stageId) stagesRun.push(stageId)
    const outcome = session.advance(STEP_BUDGET) as WasmStepOutcome
    sampleCount += outcome.stepsTaken

    if (storageStream) {
      try {
        await storageStream.add(outcome)
      } catch (storageError) {
        error = { kind: 'storageFailed', detail: String(storageError) }
        break
      }
    }

    if (outcome.error) { error = outcome.error; break }

    const now = Date.now()
    if (now - lastProgressAt > PROGRESS_INTERVAL_MS) {
      ctx.postMessage({ type: 'progress', runId, stagesRun: [...stagesRun], currentStageId: session.currentStageId(), stepsTaken: outcome.stepsTaken })
      lastProgressAt = now
    }
    if (outcome.done) break
    await yieldToEventLoop()
  }

  await finalizeStorage()
  const result: CarapaceRunResult = { stagesRun, finalStageId: session.currentStageId(), error, sampleCount, recordedNodeTags: [], modalStageCount }
  ctx.postMessage({ type: 'complete', runId, result })
}

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'run') {
    ctx.postMessage({ type: 'accepted', runId: msg.runId })
    runOne(msg.runId, msg.input, msg.layout, msg.storagePort).catch((error) => ctx.postMessage({ type: 'error', runId: msg.runId, error: String(error) }))
  } else if (msg.type === 'cancel') {
    cancelledRuns.add(msg.runId)
  }
}
