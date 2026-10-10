export type ResponseKind = 'disp' | 'vel' | 'accel' | 'reaction' | 'force'

/**
 * One axis quantity. `response` is a signed sum of recorded columns of one kind and component:
 * `single` (tags `[a]`), `sum` over `tags`, or `difference` (tags `[a, b]` -> a - b), times `scale`
 * (use -1 to flip a sign, or 1/h to turn a displacement difference into a drift ratio).
 */
export type Channel =
  | { type: 'step' }
  | { type: 'time' }
  | { type: 'response'; kind: ResponseKind; component: string; mode: 'single' | 'sum' | 'difference'; tags: number[]; scale: number }

export interface SeriesSpec {
  id: string
  /** Overrides the generated label when non-empty. */
  label: string
  color: string
  visible: boolean
  x: Channel
  y: Channel
}

export interface PlotView {
  open: boolean
  /** Overlay geometry within the viewport, in px. `pos: null` = default top-right anchor. */
  pos: { x: number; y: number } | null
  size: { w: number; h: number }
  maximized: boolean
  series: SeriesSpec[]
  /** One X channel for every series (the common "several Y vs step" case); otherwise each series uses its own `x`. */
  sharedX: boolean
  x: Channel
  showStageTicks: boolean
  showStepMarker: boolean
  showEditor: boolean
  nextSeriesId: number
}

export const DEFAULT_PLOT_VIEW: PlotView = {
  open: false,
  pos: null,
  size: { w: 520, h: 380 },
  maximized: false,
  series: [],
  sharedX: true,
  x: { type: 'step' },
  showStageTicks: true,
  showStepMarker: true,
  showEditor: true,
  nextSeriesId: 1,
}

export const SERIES_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#4b5563']
