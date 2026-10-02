export type ResultType = 'none' | 'deformed' | 'axial' | 'shear' | 'moment'

/** Which scale a result type uses; `none` has no scale. */
export type ScaleKey = Exclude<ResultType, 'none'>

export interface ResultsView {
  /** Display Results panel visible. */
  open: boolean
  runId: string | null
  step: number
  /** 0..1 position between `step` and `step + 1` while smooth playback interpolates; otherwise 0. */
  stepFrac: number
  playing: boolean
  /** Playback speed in steps per second. */
  fps: number
  loop: boolean
  /** Interpolate between steps during playback instead of jumping. */
  smooth: boolean
  type: ResultType
  /** Manual scale per type; `null` = auto (computed from the run's extents and the model size). */
  scales: Record<ScaleKey, number | null>
  showUndeformed: boolean
  showValues: boolean
  fillDiagrams: boolean
}

export const DEFAULT_RESULTS_VIEW: ResultsView = {
  open: false,
  runId: null,
  step: 0,
  stepFrac: 0,
  playing: false,
  fps: 5,
  loop: true,
  smooth: true,
  type: 'none',
  scales: { deformed: null, axial: null, shear: null, moment: null },
  showUndeformed: true,
  showValues: false,
  fillDiagrams: true,
}
