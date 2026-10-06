import { useEffect, useState } from 'react'
import { queryModal } from './resultsStorageClient'
import type { ModalStageResult } from '@/app/types/resultsStorage'

export interface ModalData {
  /** `nodeTags[i]` is node `i` of every stage's node-major mode shapes. */
  nodeTags: number[]
  stages: ModalStageResult[]
}

// The panel and the scene both read the run's modes; share one load per runId.
let current: { runId: string; promise: Promise<ModalData> } | null = null

function modalFor(runId: string): Promise<ModalData> {
  if (current?.runId !== runId) current = { runId, promise: queryModal(runId).then(({ nodeTags, stages }) => ({ nodeTags, stages })) }
  return current.promise
}

/** The run's stored modal results (empty `stages` when it has none); null while loading or when `runId` is null. */
export function useModalResults(runId: string | null): ModalData | null {
  const [loaded, setLoaded] = useState<{ runId: string; data: ModalData } | null>(null)
  useEffect(() => {
    if (!runId) return
    let live = true
    modalFor(runId).then((data) => { if (live) setLoaded({ runId, data }) }).catch(() => { if (live) setLoaded({ runId, data: { nodeTags: [], stages: [] } }) })
    return () => { live = false }
  }, [runId])
  return loaded && loaded.runId === runId ? loaded.data : null
}

