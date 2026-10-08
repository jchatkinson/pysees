/** Force diagrams: in 2D `shear`/`moment` are V and M; in 3D Vy and Mz, with `shearZ`/`momentY` the x–z plane and `torsion` T. */
export const DIAGRAM_TYPES = ['axial', 'shear', 'shearZ', 'torsion', 'moment', 'momentY'] as const
export type DiagramType = typeof DIAGRAM_TYPES[number]
export type ResultType = 'none' | 'deformed' | DiagramType | 'mode'
export const isDiagramType = (t: ResultType): t is DiagramType => (DIAGRAM_TYPES as readonly string[]).includes(t)

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
  /** The case (analysis stage) shown, by stage index; null = the one holding `step`, else the run's last. `step` is always an absolute sample index within that case's range. */
  caseStage: number | null
  /** Mode-shape view: the 0-based mode within the selected modal case. */
  mode: number
  /** Animation phase in radians: the shape is drawn scaled by cos(phase), so 0 is peak amplitude. Advances while `playing`. */
  phase: number
  /** Mode-shape animation speed in cycles per second. */
  modeSpeed: number
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
  scales: { deformed: null, axial: null, shear: null, shearZ: null, torsion: null, moment: null, momentY: null, mode: null },
  caseStage: null,
  mode: 0,
  phase: 0,
  modeSpeed: 0.5,
  showUndeformed: true,
  showValues: false,
  fillDiagrams: true,
}
