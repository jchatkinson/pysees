import type { StorageReply, StorageRequest } from '@/app/types/resultsStorage'
import { beginRun, deleteRun, finishRun, query, writeBlocks } from '@/app/lib/resultsStorage/db'

/** carapace/docs/results-storage-indexeddb.md's results-storage worker: owns the IndexedDB
 * connection (db.ts), answers write/query/lifecycle requests, and stays reusable across runs in
 * the page session. Reachable two ways — directly via the worker's own `postMessage` (what the
 * main thread uses today) and via a `MessagePort` handed over by `{ type: 'connect' }` (what the
 * analysis worker will use once Stage 4 wires it up, per the doc's "Use a MessageChannel between
 * the two workers"). Both paths run the same request handler. */
type ControlMsg = { type: 'connect'; port: MessagePort }
type InMsg = StorageRequest | ControlMsg

const ctx = self as unknown as {
  postMessage: (msg: StorageReply) => void
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
}

function requestRunId(request: StorageRequest): string {
  return request.type === 'beginRun' ? request.run.runId : request.runId
}

async function handleRequest(request: StorageRequest): Promise<StorageReply> {
  switch (request.type) {
    case 'beginRun':
      await beginRun(request.run, request.stages, request.recorders)
      return { type: 'beginRunAck', requestId: request.requestId, runId: request.run.runId }
    case 'writeBlocks': {
      const result = await writeBlocks(request.runId, request.blocks)
      return { type: 'writeBlocksAck', requestId: request.requestId, runId: request.runId, batchId: request.batchId, ...result }
    }
    case 'query': {
      const result = await query(request.runId, request.recorderId, request.firstSample, request.limit)
      return { type: 'queryResult', requestId: request.requestId, runId: request.runId, recorderId: request.recorderId, samples: result.samples, nextFirstSample: result.nextFirstSample }
    }
    case 'finishRun': {
      const status = await finishRun(request.runId, request.status, request.detail)
      return { type: 'finishRunAck', requestId: request.requestId, runId: request.runId, status }
    }
    case 'deleteRun':
      await deleteRun(request.runId)
      return { type: 'deleteRunAck', requestId: request.requestId, runId: request.runId }
  }
}

function serve(request: StorageRequest, post: (reply: StorageReply) => void) {
  handleRequest(request)
    .then(post)
    .catch((error: unknown) => post({ type: 'storageError', requestId: request.requestId, runId: requestRunId(request), detail: String(error) }))
}

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'connect') {
    msg.port.onmessage = (portEvent: MessageEvent<StorageRequest>) => serve(portEvent.data, (reply) => msg.port.postMessage(reply))
    return
  }
  serve(msg, (reply) => ctx.postMessage(reply))
}
