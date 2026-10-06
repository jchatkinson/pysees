// IndexedDB schema/service for carapace/docs/results-storage-indexeddb.md, run from inside
// resultsStorageWorker.ts only — the main thread never opens this database directly. Stage 3 of
// that doc's delivery plan: exercised here with synthetic blocks, not yet wired to a real
// analysis worker.
import type { ModalStageResult, JointDisplacementRow, RecorderKind, RunExtents, RecorderMetadata, ResultBlock, ResultSample, RunMetadata, RunStatus, StageMetadata } from '@/app/types/resultsStorage'

const DB_NAME = 'pysees-results'
// v2: responseBlocks dropped recorderId from its key — one dense row per chunk covering every
// recorded node, not one row per node per chunk (see resultsStorage.ts's header comment for why).
// v3: responseBlocks gets a [runId, firstSample] index so "the block holding step N" is one lookup.
// v4: modalResults store ([runId, stageIndex]) holds each modal stage's modes, outside the step timeline.
const DB_VERSION = 4
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
      if (e.oldVersion < 3) {
        request.transaction!.objectStore('responseBlocks').createIndex('byFirstSample', ['runId', 'firstSample'])
      }
      if (e.oldVersion < 4) {
        db.createObjectStore('modalResults', { keyPath: ['runId', 'stageIndex'] })
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

/** Row width and a recorder's first column, with the pre-reactions/forces fallbacks documented on
 * `RunMetadata.columnCount` / `RecorderMetadata.columnOffset`. */
function strideOf(run: RunMetadata): number {
  return 1 + (run.columnCount ?? run.nodeCount * run.dofsPerNode)
}
function columnOffsetOf(recorder: RecorderMetadata, run: RunMetadata): number {
  return recorder.columnOffset ?? recorder.nodeIndex * run.dofsPerNode
}

export interface QueryResult {
  samples: ResultSample[]
  nextFirstSample?: number
}

/** Slices one node's `dofsPerNode` columns out of every sample in a dense run-wide block —
 * `nodeOffset` is `1 + nodeIndex * dofsPerNode` (the `+1` skips the leading `pseudoTime`
 * column). */
function samplesFromBlock(block: ResultBlock, stride: number, nodeOffset: number, width: number): ResultSample[] {
  const view = new Float64Array(block.data)
  const samples: ResultSample[] = []
  for (let i = 0; i < block.sampleCount; i++) {
    const offset = i * stride
    samples.push({ pseudoTime: view[offset], components: Array.from(view.subarray(offset + nodeOffset, offset + nodeOffset + width)) })
  }
  return samples
}

export async function query(runId: string, recorderId: string, firstSample = 0, limit?: number): Promise<QueryResult> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'recorders', 'responseBlocks'], 'readonly')
  const run = await reqDone(tx.objectStore('runs').get(runId)) as RunMetadata | undefined
  const recorder = await reqDone(tx.objectStore('recorders').get([runId, recorderId])) as RecorderMetadata | undefined
  if (!run || !recorder) return { samples: [] }
  const nodeOffset = 1 + columnOffsetOf(recorder, run)
  const stride = strideOf(run)

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
        const blockSamples = samplesFromBlock(block, stride, nodeOffset, recorder.componentLayout.length)
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

export async function writeModal(runId: string, stages: ModalStageResult[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'modalResults'], 'readwrite')
  const run = await reqDone(tx.objectStore('runs').get(runId)) as RunMetadata | undefined
  if (!run) throw new Error(`writeModal: unknown runId ${runId}`)
  for (const result of stages) tx.objectStore('modalResults').put({ runId, stageIndex: result.stageIndex, result })
  tx.objectStore('runs').put({ ...run, modalStageCount: stages.length })
  await txDone(tx)
}

export async function queryModal(runId: string): Promise<{ nodeTags: number[]; stages: ModalStageResult[] }> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'modalResults'], 'readonly')
  const run = await reqDone(tx.objectStore('runs').get(runId)) as RunMetadata | undefined
  const rows = await reqDone(tx.objectStore('modalResults').getAll(IDBKeyRange.bound([runId, 0], [runId, Infinity]))) as { result: ModalStageResult }[]
  await txDone(tx)
  return { nodeTags: run?.nodeTags ?? [], stages: rows.map((r) => r.result).sort((a, b) => a.stageIndex - b.stageIndex) }
}

export async function listRuns(): Promise<RunMetadata[]> {
  const db = await getDb()
  const tx = db.transaction('runs', 'readonly')
  const runs = await reqDone(tx.objectStore('runs').getAll()) as RunMetadata[]
  await txDone(tx)
  return runs
}

export interface QueryJointDisplacementsResult {
  recorders: RecorderMetadata[]
  rows: JointDisplacementRow[]
}

/** Unpivots one run's dense `responseBlocks` into one row per (node, step) — the shape the
 * results-browser data table pools across runs. Pulls every recorded node for every sample, so
 * it scales with nodeCount * sampleCount; fine for today's model sizes, but if that becomes a
 * problem this is the place to add pagination or a narrower node/step filter. */
export async function queryJointDisplacements(runId: string, kind: RecorderKind = 'disp'): Promise<QueryJointDisplacementsResult> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'recorders', 'responseBlocks'], 'readonly')
  const run = await reqDone(tx.objectStore('runs').get(runId)) as RunMetadata | undefined
  if (!run) return { recorders: [], rows: [] }

  const recorders = (await reqDone(tx.objectStore('recorders').getAll(prefixRange(runId)))) as RecorderMetadata[]
  recorders.sort((a, b) => columnOffsetOf(a, run) - columnOffsetOf(b, run))
  const selected = recorders.filter((r) => (r.kind ?? 'disp') === kind)

  const rows: JointDisplacementRow[] = []
  const store = tx.objectStore('responseBlocks')
  const cursorRequest = store.openCursor(prefixRange(runId))
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) { resolve(); return }
      const block = cursor.value as ResultBlock & { runId: string }
      const stride = strideOf(run)
      const view = new Float64Array(block.data)
      for (let i = 0; i < block.sampleCount; i++) {
        const offset = i * stride
        const pseudoTime = view[offset]
        const step = block.firstSample + i
        for (const recorder of selected) {
          const nodeOffset = 1 + columnOffsetOf(recorder, run)
          rows.push({
            runId,
            stageIndex: block.stageIndex,
            step,
            pseudoTime,
            node: recorder.recorderId.replace(/^[a-z]+:/, ''),
            components: Array.from(view.subarray(offset + nodeOffset, offset + nodeOffset + recorder.componentLayout.length)),
          })
        }
      }
      cursor.continue()
    }
  })
  await txDone(tx)
  return { recorders: selected, rows }
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

async function deleteByRunId(tx: IDBTransaction, storeName: 'stages' | 'recorders' | 'responseBlocks' | 'modalResults', runId: string): Promise<void> {
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

/** Wipes every stored run. Called when a new analysis run starts or the model is reset, so the
 * results browser only ever shows the current model's latest results — this app doesn't (yet)
 * compute real model/sequence provenance hashes (see `runMetadataFor`'s `modelHash: 'unhashed'`
 * placeholder in carapaceWorkerClient.ts), so there's no way to tell an old run apart from a
 * current one; clearing on every new run sidesteps needing that hash at all. */
export async function clearAllRuns(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'stages', 'recorders', 'responseBlocks', 'modalResults'], 'readwrite')
  tx.objectStore('runs').clear()
  tx.objectStore('modalResults').clear()
  tx.objectStore('stages').clear()
  tx.objectStore('recorders').clear()
  tx.objectStore('responseBlocks').clear()
  await txDone(tx)
}

export async function deleteRun(runId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'stages', 'recorders', 'responseBlocks', 'modalResults'], 'readwrite')
  tx.objectStore('runs').delete(runId)
  await Promise.all([
    deleteByRunId(tx, 'modalResults', runId),
    deleteByRunId(tx, 'stages', runId),
    deleteByRunId(tx, 'recorders', runId),
    deleteByRunId(tx, 'responseBlocks', runId),
  ])
  await txDone(tx)
}

/** One run's metadata plus its recorders ordered by first column — enough to locate any node's
 * displacement or element's forces in a dense row. */
export async function getRunLayout(runId: string): Promise<{ run: RunMetadata | null; recorders: RecorderMetadata[]; stages: StageMetadata[] }> {
  const db = await getDb()
  const tx = db.transaction(['runs', 'recorders', 'stages'], 'readonly')
  const run = await reqDone(tx.objectStore('runs').get(runId)) as RunMetadata | undefined
  if (!run) return { run: null, recorders: [], stages: [] }
  const recorders = await reqDone(tx.objectStore('recorders').getAll(prefixRange(runId))) as RecorderMetadata[]
  recorders.sort((a, b) => columnOffsetOf(a, run) - columnOffsetOf(b, run))
  const stages = (await reqDone(tx.objectStore('stages').getAll(prefixRange(runId))) as StageMetadata[]).sort((a, b) => a.stageIndex - b.stageIndex)
  return { run, recorders, stages }
}

/** The block whose sample range contains `sample`: the last block starting at or before it. */
export async function queryBlock(runId: string, sample: number): Promise<ResultBlock | null> {
  const db = await getDb()
  const tx = db.transaction('responseBlocks', 'readonly')
  const cursorRequest = tx.objectStore('responseBlocks').index('byFirstSample').openCursor(IDBKeyRange.bound([runId, 0], [runId, sample]), 'prev')
  const cursor = await reqDone(cursorRequest)
  if (!cursor) return null
  const block = cursor.value as ResultBlock
  return sample < block.firstSample + block.sampleCount ? block : null
}

/** Max |value| per recorder kind and component label across every step of a run, or of just the steps in `range` (inclusive). */
export async function queryRunExtents(runId: string, range?: { first: number; last: number }): Promise<RunExtents> {
  const extents: RunExtents = { disp: {}, reaction: {}, force: {} }
  const { run, recorders } = await getRunLayout(runId)
  if (!run) return extents
  const stride = strideOf(run)
  const maxima = recorders.map((r) => new Float64Array(r.componentLayout.length))
  const db = await getDb()
  const tx = db.transaction('responseBlocks', 'readonly')
  const cursorRequest = tx.objectStore('responseBlocks').openCursor(prefixRange(runId))
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) { resolve(); return }
      const block = cursor.value as ResultBlock
      const view = new Float64Array(block.data)
      for (let i = 0; i < block.sampleCount; i++) {
        if (range && (block.firstSample + i < range.first || block.firstSample + i > range.last)) continue
        recorders.forEach((rec, k) => {
          const base = i * stride + 1 + columnOffsetOf(rec, run)
          for (let c = 0; c < maxima[k].length; c++) {
            const v = Math.abs(view[base + c])
            if (v > maxima[k][c]) maxima[k][c] = v
          }
        })
      }
      cursor.continue()
    }
  })
  recorders.forEach((rec, k) => {
    const bucket = extents[rec.kind ?? 'disp']
    rec.componentLayout.forEach((label, c) => { bucket[label] = Math.max(bucket[label] ?? 0, maxima[k][c]) })
  })
  return extents
}

export interface ColumnsResult {
  sampleCount: number
  pseudoTime: Float64Array
  stage: Uint16Array
  data: Float64Array[]
}

/** Time series of selected row indices (0 is pseudoTime; recorder columns start at 1) over every step, in one block scan. */
export async function queryColumns(runId: string, columns: number[]): Promise<ColumnsResult> {
  const { run } = await getRunLayout(runId)
  const sampleCount = run?.sampleCount ?? 0
  const result: ColumnsResult = { sampleCount, pseudoTime: new Float64Array(sampleCount), stage: new Uint16Array(sampleCount), data: columns.map(() => new Float64Array(sampleCount)) }
  if (!run || sampleCount === 0) return result
  const stride = strideOf(run)
  const db = await getDb()
  const tx = db.transaction('responseBlocks', 'readonly')
  const cursorRequest = tx.objectStore('responseBlocks').openCursor(prefixRange(runId))
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) { resolve(); return }
      const block = cursor.value as ResultBlock
      const view = new Float64Array(block.data)
      for (let i = 0; i < block.sampleCount; i++) {
        const step = block.firstSample + i
        if (step >= sampleCount) break
        const base = i * stride
        result.pseudoTime[step] = view[base]
        result.stage[step] = block.stageIndex
        for (let c = 0; c < columns.length; c++) result.data[c][step] = view[base + columns[c]]
      }
      cursor.continue()
    }
  })
  return result
}
