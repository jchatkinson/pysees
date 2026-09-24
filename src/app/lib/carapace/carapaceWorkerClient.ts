import type { CarapaceInputV1 } from '@/app/types/carapaceInputV1'
import type { CarapaceRunProgress, CarapaceRunResult } from '@/app/types/carapaceRun'

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

/** Runs a compiled CarapaceInputV1 on the shared carapace analysis worker (see
 * carapaceWorker.ts / pysees-handoff.md's worker protocol) instead of the main thread. */
export function runCarapaceOnWorker(
  runId: string,
  input: CarapaceInputV1,
  options: RunCarapaceOnWorkerOptions = {},
): { promise: Promise<CarapaceRunResult>; cancel: () => void } {
  const w = getWorker()
  const promise = new Promise<CarapaceRunResult>((resolve, reject) => {
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
    w.postMessage({ type: 'run', runId, input })
  })
  const cancel = () => w.postMessage({ type: 'cancel', runId })
  return { promise, cancel }
}
