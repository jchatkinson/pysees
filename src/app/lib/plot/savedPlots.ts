import type { PlotView } from '@/app/types/plotView'
import type { PlotConfig, SavedPlot } from '@/app/types/savedPlot'
import { describeChannel, seriesLabel } from './channels'

export const snapshotPlot = (pv: PlotView): PlotConfig =>
  structuredClone({ series: pv.series, sharedX: pv.sharedX, x: pv.x, showStageTicks: pv.showStageTicks, showStepMarker: pv.showStepMarker })

/** `PlotView` fields to set when restoring a saved config (the overlay opens; geometry is kept). */
export const restorePlot = (config: PlotConfig): Partial<PlotView> => {
  const c = structuredClone(config)
  return { ...c, open: true, nextSeriesId: c.series.reduce((m, s) => Math.max(m, Number(s.id.slice(1)) || 0), 0) + 1 }
}

export const plotNameFor = (config: PlotConfig): string => {
  const first = config.series[0]
  if (!first) return 'Plot'
  const name = seriesLabel(first.label, config.sharedX ? config.x : first.x, first.y)
  return config.series.length > 1 ? `${name} +${config.series.length - 1}` : name
}

/** Uses `base` if free, else "base (2)", "base (3)", … */
export function uniqueName(base: string, plots: SavedPlot[], ignoreId?: number): string {
  const taken = new Set(plots.filter((p) => p.id !== ignoreId).map((p) => p.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

export const summarizePlot = (config: PlotConfig): string => {
  const n = config.series.length
  const x = config.sharedX ? describeChannel(config.x) : 'per-series X'
  return `${n} series · vs ${x}`
}

/** Same configuration (ignores window geometry) — used to tell whether the open plot differs from its saved entry. */
export const samePlot = (a: PlotConfig, b: PlotConfig): boolean => JSON.stringify(a) === JSON.stringify(b)
