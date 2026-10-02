import { useEffect, useState } from 'react'
import { StepFrameSource } from './stepFrames'

// The panel and the scene both need the current run's source; share one instance per runId.
let current: { runId: string; promise: Promise<StepFrameSource | null> } | null = null

function sourceFor(runId: string): Promise<StepFrameSource | null> {
  if (current?.runId !== runId) current = { runId, promise: StepFrameSource.open(runId) }
  return current.promise
}

/** The run's step-frame source once its layout has loaded; null while loading or when `runId` is null/unknown. */
export function useResultsSource(runId: string | null): StepFrameSource | null {
  const [loaded, setLoaded] = useState<{ runId: string; source: StepFrameSource | null } | null>(null)
  useEffect(() => {
    if (!runId) return
    let live = true
    sourceFor(runId).then((source) => { if (live) setLoaded({ runId, source }) }).catch(() => { if (live) setLoaded({ runId, source: null }) })
    return () => { live = false }
  }, [runId])
  return loaded && loaded.runId === runId ? loaded.source : null
}
