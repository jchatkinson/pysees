import type { Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import type { Quantity } from '@/app/lib/commands/comparison'

/** Page sections, in display order. */
export const CATEGORIES = [
  { id: 'linear', title: 'Linear elastic frames and trusses' },
  { id: 'shells', title: 'Shells and plates' },
  { id: 'material', title: 'Material nonlinearity' },
  { id: 'cyclic', title: 'Cyclic material response' },
  { id: 'geometric', title: 'Geometric nonlinearity' },
  { id: 'fiber3d', title: '3D fiber members' },
  { id: 'dynamics', title: 'Modal and transient dynamics' },
  { id: 'solution', title: 'Solution algorithms' },
] as const
export type CategoryId = (typeof CATEGORIES)[number]['id']

/** One recorded series, read the same way from both engines. `dof` is 1-based (as in OpenSees); `component` indexes the element's force row. */
export type Signal =
  | { q: 'disp' | 'vel' | 'accel' | 'reaction'; node: number; dof: number }
  | { q: 'force' | 'shell'; ele: number; component: number }
  | { q: 'time' }
  | { q: 'step' }
  | { sum: Signal[]; scale?: number }

export interface PlotSpec {
  title: string
  x: Signal
  y: Signal
  xLabel: string
  yLabel: string
  /** `hysteresis` plots draw square. */
  kind?: 'line' | 'hysteresis'
  /** Only the steps of these wire stages (indices into the compiled sequence). Default: every step. */
  stages?: number[]
  /** Start the curve at (0, 0): the unloaded state before the first recorded step. */
  origin?: boolean
}

/** How the screenshot script frames the model and which result it captures. */
export interface ShotSpec {
  view?: '3d' | 'front' | 'side' | 'top'
  result?: 'deformed' | 'N' | 'V' | 'M' | 'contour' | 'mode'
  /** Step to show; default the last. */
  step?: number
  /** Show members at their section shape. */
  extruded?: boolean
}

export interface CaseModel { model: Model; history: AnalysisHistory; gridlines?: GridlineEntity[]; levels?: LevelEntity[] }

export interface VerificationCase {
  /** URL slug. */
  id: string
  category: CategoryId
  build: () => CaseModel
  /** Quantities left out of the comparison, each with the reason (shown on the page). */
  skip?: { quantity: Quantity; why: string }[]
  /** Tolerance override (default `RTOL`); a looser one carries its reason. With `quantities`, it applies to those only and the rest keep `RTOL`. */
  rtol?: { value: number; why: string; quantities?: Quantity[] }
  /** Modal case: compare this many frequencies and mode shapes instead of recorder columns. */
  modes?: number
  /** Plots for the page; a function when the signals depend on the built model (e.g. base shear over its supports). */
  plots: PlotSpec[] | ((m: CaseModel) => PlotSpec[])
  /** Closed-form references, each drawn on plot `plot` as a dashed line through its points. */
  analytical?: { label: string; plot: number; points: () => [number, number][] }[]
  shot: ShotSpec
  /** Carapace source files (repo-relative) for the elements and materials the case exercises. */
  sources: string[]
}

export const RTOL = 1e-5

export interface QuantityMetric { compared: number; scale: number; maxAbs: number; maxRel: number }

export interface PlotResult { title: string; xLabel: string; yLabel: string; kind: 'line' | 'hysteresis'; carapace: [number, number][]; opensees: [number, number][]; analytical?: { label: string; points: [number, number][] } }

export interface ModalResult { carapace: number[]; opensees: number[]; frequencyMaxRel: number; shapeMaxAbs: number }

/** What the generator writes for each case (`src/marketing/verification/data/<id>.json`). */
export interface CaseResult {
  id: string
  category: CategoryId
  steps: { carapace: number; opensees: number }
  metrics: Partial<Record<Quantity, QuantityMetric>>
  modal?: ModalResult
  skip: { quantity: Quantity; why: string }[]
  rtol: { value: number; why?: string; quantities?: Quantity[] }
  /** Largest relative difference over every compared quantity (modal: frequencies and shapes). */
  worst: number
  pass: boolean
  /** Why it failed, when it did. */
  problems: string[]
  plots: PlotResult[]
  sources: string[]
  shot: ShotSpec
  ndm: number
  elements: number
  nodes: number
}
