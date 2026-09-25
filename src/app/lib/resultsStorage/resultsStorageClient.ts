import type { RecorderMetadata, ResultBlock, RunMetadata, StageMetadata, StorageReply, StorageRequest } from '@/app/types/resultsStorage'

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('@/app/workers/resultsStorageWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

let requestCounter = 0
function nextRequestId(): string {
  return `req-${Date.now()}-${requestCounter++}`
}

function send<R extends StorageReply>(request: StorageRequest): Promise<R> {
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<StorageReply>) => {
      const reply = e.data
      if (reply.requestId !== request.requestId) return
      w.removeEventListener('message', onMessage)
      if (reply.type === 'storageError') reject(new Error(reply.detail))
      else resolve(reply as R)
    }
    w.addEventListener('message', onMessage)
    w.postMessage(request)
  })
}

/** Main-thread client for the results-storage worker (resultsStorageWorker.ts). Stage 4 of
 * carapace/docs/results-storage-indexeddb.md's delivery plan replaces most of this traffic with
 * a direct analysis-worker\<->storage-worker `MessagePort` for writes/progress; this client stays
 * the path for query/delete/export calls the main thread makes on its own. */
export function beginRun(run: RunMetadata, stages: StageMetadata[], recorders: RecorderMetadata[]) {
  return send<Extract<StorageReply, { type: 'beginRunAck' }>>({ type: 'beginRun', requestId: nextRequestId(), run, stages, recorders })
}

export function writeBlocks(runId: string, batchId: string, blocks: ResultBlock[]) {
  return send<Extract<StorageReply, { type: 'writeBlocksAck' }>>({ type: 'writeBlocks', requestId: nextRequestId(), runId, batchId, blocks })
}

export function queryResults(runId: string, recorderId: string, firstSample?: number, limit?: number) {
  return send<Extract<StorageReply, { type: 'queryResult' }>>({ type: 'query', requestId: nextRequestId(), runId, recorderId, firstSample, limit })
}

export function finishRun(runId: string, status: 'complete' | 'failed' | 'cancelled' | 'storage-failed', detail?: string) {
  return send<Extract<StorageReply, { type: 'finishRunAck' }>>({ type: 'finishRun', requestId: nextRequestId(), runId, status, detail })
}

export function deleteRun(runId: string) {
  return send<Extract<StorageReply, { type: 'deleteRunAck' }>>({ type: 'deleteRun', requestId: nextRequestId(), runId })
}

/** Hands one side of a `MessageChannel` to the storage worker (see resultsStorageWorker.ts's
 * `{ type: 'connect' }` handling) so the analysis worker, given the other side, can send
 * `writeBlocks` directly instead of relaying every batch through the main thread. */
export function connect(port: MessagePort) {
  getWorker().postMessage({ type: 'connect', port }, [port])
}
