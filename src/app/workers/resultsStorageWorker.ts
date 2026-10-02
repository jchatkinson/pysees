import type { StorageReply, StorageRequest } from '@/app/types/resultsStorage'
import { beginRun, clearAllRuns, deleteRun, finishRun, getRunLayout, listRuns, query, queryBlock, queryColumns, queryJointDisplacements, queryRunExtents, writeBlocks } from '@/app/lib/resultsStorage/db'

/** carapace/docs/results-storage-indexeddb.md's results-storage worker: owns the IndexedDB
 * connection (db.ts), answers write/query/lifecycle requests, and stays reusable across runs in
 * the page session. Reachable two ways — directly via the worker's own `postMessage` (what the
 * main thread uses today) and via a `MessagePort` handed over by `{ type: 'connect' }` (what the
 * analysis worker will use once Stage 4 wires it up, per the doc's "Use a MessageChannel between
 * the two workers"). Both paths run the same request handler. */
type ControlMsg = { type: 'connect'; port: MessagePort }
type InMsg = StorageRequest | ControlMsg

const ctx = self as unknown as {
  postMessage: (msg: StorageReply, transfer?: Transferable[]) => void
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
}

function requestRunId(request: StorageRequest): string {
  if (request.type === 'beginRun') return request.run.runId
  if (request.type === 'listRuns' || request.type === 'clearAllRuns') return ''
  return request.runId
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
    case 'clearAllRuns':
      await clearAllRuns()
      return { type: 'clearAllRunsAck', requestId: request.requestId }
    case 'listRuns': {
      const runs = await listRuns()
      return { type: 'listRunsResult', requestId: request.requestId, runs }
    }
    case 'queryJointDisplacements': {
      const result = await queryJointDisplacements(request.runId, request.kind)
      return { type: 'queryJointDisplacementsResult', requestId: request.requestId, runId: request.runId, recorders: result.recorders, rows: result.rows }
    }
    case 'getRunLayout': {
      const { run, recorders } = await getRunLayout(request.runId)
      return { type: 'getRunLayoutResult', requestId: request.requestId, runId: request.runId, run, recorders }
    }
    case 'queryBlock': {
      const block = await queryBlock(request.runId, request.sample)
      return { type: 'queryBlockResult', requestId: request.requestId, runId: request.runId, block }
    }
    case 'queryColumns': {
      const result = await queryColumns(request.runId, request.columns)
      return { type: 'queryColumnsResult', requestId: request.requestId, runId: request.runId, ...result }
    }
    case 'queryRunExtents': {
      const extents = await queryRunExtents(request.runId)
      return { type: 'queryRunExtentsResult', requestId: request.requestId, runId: request.runId, extents }
    }
  }
}

function transferList(reply: StorageReply): Transferable[] {
  if (reply.type === 'queryBlockResult') return reply.block ? [reply.block.data] : []
  if (reply.type === 'queryColumnsResult') return [reply.pseudoTime.buffer, reply.stage.buffer, ...reply.data.map((d) => d.buffer)]
  return []
}

function serve(request: StorageRequest, post: (reply: StorageReply, transfer?: Transferable[]) => void) {
  handleRequest(request)
    .then((reply) => post(reply, transferList(reply)))
    .catch((error: unknown) => post({ type: 'storageError', requestId: request.requestId, runId: requestRunId(request), detail: String(error) }))
}

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'connect') {
    msg.port.onmessage = (portEvent: MessageEvent<StorageRequest>) => serve(portEvent.data, (reply, transfer = []) => msg.port.postMessage(reply, transfer))
    return
  }
  serve(msg, (reply) => ctx.postMessage(reply))
}
