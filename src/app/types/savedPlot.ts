import type { PlotView } from '@/app/types/plotView'

/** The part of a plot that is configuration (not window geometry, not results). */
export type PlotConfig = Pick<PlotView, 'series' | 'sharedX' | 'x' | 'showStageTicks' | 'showStepMarker'>

/** A report entry. `kind` leaves room for other saved views (e.g. viewport results display) later. */
export interface SavedPlot {
  kind: 'plot'
  id: number
  name: string
  config: PlotConfig
}
