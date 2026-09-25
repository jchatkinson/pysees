export interface CarapaceRunResult {
  stagesRun: string[]
  finalStageId: string | undefined
  error: { kind: string; [key: string]: unknown } | null
  /** Every recorded node shares one timeline (carapace/docs/results-storage-indexeddb.md's dense
   * layout), so one count covers them all — already persisted via the results-storage worker.
   * Query resultsStorageClient on demand for the actual values instead of keeping the full run
   * in memory here. */
  sampleCount: number
  /** Node tags recorded for displacement, recorderId === String(tag) in the results-storage
   * worker — the order matches compileInputV1's `recordedNodeTags`. */
  recordedNodeTags: number[]
}

export interface CarapaceRunProgress {
  stagesRun: string[]
  currentStageId: string | undefined
  stepsTaken: number
}
