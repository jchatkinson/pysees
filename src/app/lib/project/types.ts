import type { Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import type { SavedPlot } from '@/app/types/savedPlot'
import type { PlotView } from '@/app/types/plotView'
import type { ResultsView } from '@/app/types/resultsView'

/** Display preferences worth keeping: nothing here depends on a run (no selection, step, playback or open panels). */
export interface ProjectDisplay {
  viewSettings: Record<string, boolean>
  hiddenLoadPatterns: number[]
  resultsView: Partial<ResultsView>
  plotView: Partial<PlotView>
}

/** Everything a saved project restores. Computed results, undo/redo history and selections are not part of it. */
export interface ProjectDocument {
  model: Model
  /** Commands up to the cursor; opening puts the cursor on the last one. */
  analysis: AnalysisHistory
  gridlines: GridlineEntity[]
  levels: LevelEntity[]
  nextGridlineId: number
  nextLevelId: number
  savedPlots: SavedPlot[]
  nextSavedPlotId: number
  activeSavedPlotId: number | null
  display: ProjectDisplay
}

/** The slice of store state a project is captured from. */
export interface ProjectSource {
  model: Model
  analysisHistory: AnalysisHistory
  gridlines: GridlineEntity[]
  levels: LevelEntity[]
  nextGridlineId: number
  nextLevelId: number
  savedPlots: SavedPlot[]
  nextSavedPlotId: number
  activeSavedPlotId: number | null
  viewSettings: Record<string, boolean>
  hiddenLoadPatterns: number[]
  resultsView: ResultsView
  plotView: PlotView
}

/** Results-view fields kept in a project (the rest is playback or run state). */
export const RESULTS_PREF_KEYS = ['fps', 'loop', 'smooth', 'type', 'scales', 'modeSpeed', 'contour', 'contourDeformed', 'showUndeformed', 'showValues', 'fillDiagrams'] as const
/** Plot-overlay fields kept in a project: the plot configuration and the window geometry. */
export const PLOT_PREF_KEYS = ['pos', 'size', 'maximized', 'series', 'sharedX', 'x', 'showStageTicks', 'showStepMarker', 'showEditor', 'nextSeriesId'] as const

const pick = <T extends object>(o: T, keys: readonly (keyof T)[]): Partial<T> => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, structuredClone(o[k])])) as Partial<T>

export function captureProject(s: ProjectSource): ProjectDocument {
  const commands = s.analysisHistory.commands.slice(0, s.analysisHistory.cursor + 1)
  const resultsView = pick(s.resultsView, RESULTS_PREF_KEYS)
  // Mode shapes need a run; the saved display falls back to the plain model.
  if (resultsView.type === 'mode') resultsView.type = 'deformed'
  return {
    model: s.model, analysis: { commands, cursor: commands.length - 1 },
    gridlines: s.gridlines, levels: s.levels, nextGridlineId: s.nextGridlineId, nextLevelId: s.nextLevelId,
    savedPlots: s.savedPlots, nextSavedPlotId: s.nextSavedPlotId, activeSavedPlotId: s.activeSavedPlotId,
    display: { viewSettings: { ...s.viewSettings }, hiddenLoadPatterns: [...s.hiddenLoadPatterns], resultsView, plotView: { ...pick(s.plotView, PLOT_PREF_KEYS), open: false } },
  }
}
