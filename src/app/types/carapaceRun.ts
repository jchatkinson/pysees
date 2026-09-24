export interface CarapaceRunResult {
  stagesRun: string[]
  finalStageId: string | undefined
  error: { kind: string; [key: string]: unknown } | null
  /** samples[recorderIndex] = [pseudoTime, value][] */
  recorderSamples: [number, number][][]
}

export interface CarapaceRunProgress {
  stagesRun: string[]
  currentStageId: string | undefined
  stepsTaken: number
}
