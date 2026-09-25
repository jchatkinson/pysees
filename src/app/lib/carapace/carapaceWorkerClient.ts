import type { CarapaceInputV1 } from '@/app/types/carapaceInputV1'
import type { CarapaceRunProgress, CarapaceRunResult } from '@/app/types/carapaceRun'
import type { RecorderMetadata, RunMetadata, StageMetadata } from '@/app/types/resultsStorage'
import * as resultsStorage from '@/app/lib/resultsStorage/resultsStorageClient'

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('@/app/workers/carapaceWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

let runCounter = 0
export function nextCarapaceRunId(): string {
  return `run-${Date.now()}-${runCounter++}`
}

export interface RunCarapaceOnWorkerOptions {
  onProgress?: (progress: CarapaceRunProgress) => void
}

function runMetadataFor(runId: string, input: CarapaceInputV1, nodeCount: number, dofsPerNode: number): RunMetadata {
  return {
    runId,
    // pysees's compiler doesn't produce model/sequence provenance hashes yet
    // (pysees-handoff.md's "assigns run_id and provenance hashes" is still unimplemented) —
    // placeholders until that lands.
    modelHash: 'unhashed',
    sequenceHash: 'unhashed',
    schemaVersion: input.header.schemaVersion,
    engineVersion: input.header.engineVersion,
    startedAt: Date.now(),
    status: 'running',
    dofsPerNode,
    nodeCount,
    sampleCount: 0,
  }
}

function stageMetadataFor(runId: string, input: CarapaceInputV1): StageMetadata[] {
  return input.sequence.stages.map((stage, stageIndex) => ({ runId, stageIndex, stageId: stage.id, kind: stage.kind, status: 'pending' }))
}

function recorderMetadataFor(runId: string, recordedNodeTags: number[], dofsPerNode: number): RecorderMetadata[] {
  return recordedNodeTags.map((tag, nodeIndex) => ({
    runId,
    recorderId: String(tag),
    nodeIndex,
    componentLayout: Array.from({ length: dofsPerNode }, (_, dof) => `dof${dof}`),
  }))
}

/** Runs a compiled CarapaceInputV1 on the shared carapace analysis worker (see
 * carapaceWorker.ts / pysees-handoff.md's worker protocol), persisting results through the
 * results-storage worker per carapace/docs/results-storage-indexeddb.md: this begins the run's
 * IndexedDB row before the analysis worker starts, hands the analysis worker a direct
 * `MessagePort` to the storage worker for `writeBlocks` traffic, and finalizes the run's stored
 * status once the analysis worker settles. `recordedNodeTags`/`dofsPerNode` come straight from
 * compileInputV1's result — every recorded node always carries its full displacement vector, so
 * these two numbers are all the dense results-storage layout needs. */
export function runCarapaceOnWorker(
  runId: string,
  input: CarapaceInputV1,
  recordedNodeTags: number[],
  dofsPerNode: number,
  options: RunCarapaceOnWorkerOptions = {},
): { promise: Promise<CarapaceRunResult>; cancel: () => void } {
  const w = getWorker()
  const nodeCount = recordedNodeTags.length

  const promise = (async () => {
    await resultsStorage.beginRun(
      runMetadataFor(runId, input, nodeCount, dofsPerNode),
      stageMetadataFor(runId, input),
      recorderMetadataFor(runId, recordedNodeTags, dofsPerNode),
    )

    const channel = new MessageChannel()
    resultsStorage.connect(channel.port1)

    const result = await new Promise<CarapaceRunResult>((resolve, reject) => {
      const onMessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.runId !== runId) return
        switch (msg.type) {
          case 'progress':
            options.onProgress?.({ stagesRun: msg.stagesRun, currentStageId: msg.currentStageId, stepsTaken: msg.stepsTaken })
            return
          case 'complete':
            cleanup()
            resolve(msg.result)
            return
          case 'cancelled':
            cleanup()
            reject(new Error('cancelled'))
            return
          case 'error':
            cleanup()
            reject(new Error(msg.error))
            return
        }
      }
      const cleanup = () => w.removeEventListener('message', onMessage)
      w.addEventListener('message', onMessage)
      w.postMessage({ type: 'run', runId, input, dofsPerNode, storagePort: channel.port2 }, [channel.port2])
    }).catch(async (error: unknown) => {
      const cancelled = error instanceof Error && error.message === 'cancelled'
      await resultsStorage.finishRun(runId, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : String(error))
      throw error
    })

    result.recordedNodeTags = recordedNodeTags
    const status = result.error ? (result.error.kind === 'storageFailed' ? 'storage-failed' : 'failed') : 'complete'
    await resultsStorage.finishRun(runId, status, result.error ? JSON.stringify(result.error) : undefined)
    return result
  })()

  const cancel = () => w.postMessage({ type: 'cancel', runId })
  return { promise, cancel }
}
