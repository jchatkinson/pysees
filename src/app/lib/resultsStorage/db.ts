// IndexedDB schema/service for carapace/docs/results-storage-indexeddb.md, run from inside
// resultsStorageWorker.ts only — the main thread never opens this database directly. Stage 3 of
// that doc's delivery plan: exercised here with synthetic blocks, not yet wired to a real
// analysis worker.
import type { RecorderMetadata, ResultBlock, ResultSample, RunMetadata, RunStatus, StageMetadata } from '@/app/types/resultsStorage'

const DB_NAME = 'pysees-results'
// v2: responseBlocks dropped recorderId from its key — one dense row per chunk covering every
// recorded node, not one row per node per chunk (see resultsStorage.ts's header comment for why).
const DB_VERSION = 2
const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(['complete', 'failed', 'cancelled', 'storage-failed', 'interrupted'])

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = request.result
      if (e.oldVersion < 1) {
        db.createObjectStore('runs', { keyPath: 'runId' })
        db.createObjectStore('stages', { keyPath: ['runId', 'stageIndex'] })
        db.createObjectStore('recorders', { keyPath: ['runId', 'recorderId'] })
      }
      if (e.oldVersion < 2) {
        // keyPath can't be altered in place — recreate with the v2 shape. No migration: this is
        // still pre-release, dev-time data only.
        if (db.objectStoreNames.contains('responseBlocks')) db.deleteObjectStore('responseBlocks')
        db.createObjectStore('responseBlocks', { keyPath: ['runId', 'blockIndex'] })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function reqDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Any run left in a non-terminal status by a prior page session (reload/close mid-run, so
 * `finishRun` never arrived) is reconciled to `interrupted` — see results-storage-indexeddb.md's
 * "Interrupted runs". Runs once per database open, before any request is served. */
async function reconcileInterruptedRuns(db: IDBDatabase): Promise<void> {
  const tx = db.transaction('runs', 'readwrite')
  const store = tx.objectStore('runs')
  const cursorRequest = store.openCursor()
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) { resolve(); return }
      const run = cursor.value as RunMetadata
      if (!TERMINAL_STATUSES.has(run.status)) {
        cursor.update({ ...run, status: 'interrupted' satisfies RunStatus, completedAt: run.completedAt ?? Date.now() })
      }
      cursor.continue()
    }
  })
  await txDone(tx)
}

let dbPromise: Promise<IDBDatabase> | null = null
export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb().then(async (db) => { await reconcileInterruptedRuns(db); return db })
  return dbPromise
}

export async function beginRun(run: RunMetadata, stages: StageMetadata[], recorders: RecorderMetadata[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'stages', 'recorders'], 'readwrite')
  tx.objectStore('runs').put(run)
  for (const stage of stages) tx.objectStore('stages').put(stage)
  for (const recorder of recorders) tx.objectStore('recorders').put(recorder)
  await txDone(tx)
}

export interface WriteBlocksResult {
  committedBlockKeys: [runId: string, blockIndex: number][]
  committedSampleCount: number
}

/** `put()` on the block's own composite key is naturally idempotent, so a retried batch (same
 * `blockIndex`es) just overwrites in place. The run's `sampleCount` uses `Math.max` for the same
 * reason: a retry must not double-count. Runs with `durability: 'relaxed'`, since these writes
 * happen every `advance()` flush and a crash losing the last unflushed chunk is an acceptable
 * trade for not fsync-ing every one — `beginRun`/`finishRun` stay at the default durability. */
export async function writeBlocks(runId: string, blocks: ResultBlock[]): Promise<WriteBlocksResult> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'responseBlocks'], 'readwrite', { durability: 'relaxed' })
  const runsStore = tx.objectStore('runs')
  const blocksStore = tx.objectStore('responseBlocks')

  const run = await reqDone(runsStore.get(runId)) as RunMetadata | undefined
  if (!run) throw new Error(`writeBlocks: unknown runId ${runId}`)

  const committedBlockKeys: WriteBlocksResult['committedBlockKeys'] = []
  let sampleCount = run.sampleCount
  for (const block of blocks) {
    blocksStore.put({ runId, ...block })
    committedBlockKeys.push([runId, block.blockIndex])
    sampleCount = Math.max(sampleCount, block.firstSample + block.sampleCount)
  }
  runsStore.put({ ...run, sampleCount })
  await txDone(tx)
  return { committedBlockKeys, committedSampleCount: sampleCount }
}

export interface QueryResult {
  samples: ResultSample[]
  nextFirstSample?: number
}

/** Slices one node's `dofsPerNode` columns out of every sample in a dense run-wide block —
 * `nodeOffset` is `1 + nodeIndex * dofsPerNode` (the `+1` skips the leading `pseudoTime`
 * column). */
function samplesFromBlock(block: ResultBlock, nodeCount: number, dofsPerNode: number, nodeOffset: number): ResultSample[] {
  const stride = 1 + nodeCount * dofsPerNode
  const view = new Float64Array(block.data)
  const samples: ResultSample[] = []
  for (let i = 0; i < block.sampleCount; i++) {
    const offset = i * stride
    samples.push({ pseudoTime: view[offset], components: Array.from(view.subarray(offset + nodeOffset, offset + nodeOffset + dofsPerNode)) })
  }
  return samples
}

export async function query(runId: string, recorderId: string, firstSample = 0, limit?: number): Promise<QueryResult> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'recorders', 'responseBlocks'], 'readonly')
  const run = await reqDone(tx.objectStore('runs').get(runId)) as RunMetadata | undefined
  const recorder = await reqDone(tx.objectStore('recorders').get([runId, recorderId])) as RecorderMetadata | undefined
  if (!run || !recorder) return { samples: [] }
  const nodeOffset = 1 + recorder.nodeIndex * run.dofsPerNode

  const store = tx.objectStore('responseBlocks')
  const range = IDBKeyRange.bound([runId, 0], [runId, Infinity])

  const samples: ResultSample[] = []
  let nextFirstSample: number | undefined
  const cursorRequest = store.openCursor(range)
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) { resolve(); return }
      const block = cursor.value as ResultBlock & { runId: string }
      const blockEnd = block.firstSample + block.sampleCount
      if (blockEnd > firstSample) {
        const blockSamples = samplesFromBlock(block, run.nodeCount, run.dofsPerNode, nodeOffset)
        const startIndex = Math.max(0, firstSample - block.firstSample)
        for (let i = startIndex; i < blockSamples.length; i++) {
          if (limit !== undefined && samples.length >= limit) {
            nextFirstSample = block.firstSample + i
            resolve()
            return
          }
          samples.push(blockSamples[i])
        }
      }
      cursor.continue()
    }
  })
  await txDone(tx).catch(() => { /* tx may already be inactive if we resolved early via limit */ })
  return { samples, nextFirstSample }
}

export async function finishRun(runId: string, status: 'complete' | 'failed' | 'cancelled' | 'storage-failed', detail?: string): Promise<RunStatus> {
  const db = await getDb()
  const tx = db.transaction('runs', 'readwrite')
  const store = tx.objectStore('runs')
  const run = await reqDone(store.get(runId)) as RunMetadata | undefined
  if (!run) throw new Error(`finishRun: unknown runId ${runId}`)
  const updated: RunMetadata = {
    ...run,
    status,
    completedAt: Date.now(),
    ...(status === 'storage-failed' ? { storageFailureDetail: detail } : { errorDetail: detail }),
  }
  store.put(updated)
  await txDone(tx)
  return status
}

function prefixRange(runId: string): IDBKeyRange {
  return IDBKeyRange.bound([runId], [runId, []])
}

async function deleteByRunId(tx: IDBTransaction, storeName: 'stages' | 'recorders' | 'responseBlocks', runId: string): Promise<void> {
  const store = tx.objectStore(storeName)
  const cursorRequest = store.openCursor(prefixRange(runId))
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) { resolve(); return }
      cursor.delete()
      cursor.continue()
    }
  })
}

export async function deleteRun(runId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'stages', 'recorders', 'responseBlocks'], 'readwrite')
  tx.objectStore('runs').delete(runId)
  await Promise.all([
    deleteByRunId(tx, 'stages', runId),
    deleteByRunId(tx, 'recorders', runId),
    deleteByRunId(tx, 'responseBlocks', runId),
  ])
  await txDone(tx)
}
