import { create } from 'zustand'
import type { AnalysisCommand, AnalysisHistory } from '@/app/types/analysisCommands'
import { emptyAnalysisHistory } from '@/app/types/analysisCommands'
import type { Model, ResultsState } from '@/app/types/model'
import { emptyModel } from '@/app/types/model'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import { validateUniaxialMaterialValues } from '@/app/lib/commandSchemas'
import { applyModelWrite, deleteEntity, previewDeleteEntity, removeModelChild, type ModelDeletableKind, type ModelWrite } from '@/app/lib/modelWrite'
import { runMaterialPreview as runCarapaceMaterialPreview } from '@/app/lib/carapace/materialPreview'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { runCarapaceOnWorker, nextCarapaceRunId } from '@/app/lib/carapace/carapaceWorkerClient'
import { clearAllRuns } from '@/app/lib/resultsStorage/resultsStorageClient'
import type { CarapaceRunProgress, CarapaceRunResult } from '@/app/types/carapaceRun'
import { DEFAULT_RESULTS_VIEW, type ResultsView } from '@/app/types/resultsView'
import type { SavedPlot } from '@/app/types/savedPlot'
import { plotNameFor, restorePlot, snapshotPlot, uniqueName } from '@/app/lib/plot/savedPlots'
import { DEFAULT_PLOT_VIEW, SERIES_COLORS, type Channel, type PlotView, type SeriesSpec } from '@/app/types/plotView'
import type { CompileDiagnostic } from '@/app/lib/compileAnalysisSequence'

/** Suits both forces and displacements in most structural problems. */
export const DEFAULT_ZERO_TOLERANCE = 1e-6

export interface CarapaceRunState {
  status: 'idle' | 'compiling' | 'running' | 'done' | 'error' | 'cancelled'
  diagnostics: CompileDiagnostic[]
  result: CarapaceRunResult | null
  error: string | null
  progress: CarapaceRunProgress | null
  runId: string | null
}

const IDLE_CARAPACE_RUN: CarapaceRunState = { status: 'idle', diagnostics: [], result: null, error: null, progress: null, runId: null }
let activeCarapaceCancel: (() => void) | null = null

const DEFAULT_STRAIN_PROTOCOL = [0, 0.001, -0.001, 0.002, -0.002, 0.003, -0.003, 0]
let activePreviewJob: string | null = null
const MODEL_UNDO_DEPTH = 100

interface AppStore {
  model: Model
  modelPast: Model[]
  modelFuture: Model[]
  analysisHistory: AnalysisHistory
  gridlines: GridlineEntity[]
  /** Results with |value| below this display as a plain 0 instead of scientific notation. */
  zeroTolerance: number
  setZeroTolerance: (tol: number) => void
  nextGridlineId: number
  levels: LevelEntity[]
  nextLevelId: number
  gridlinesDialogOpen: boolean
  setGridlinesDialogOpen: (open: boolean) => void
  materialDialogOpen: boolean
  setMaterialDialogOpen: (open: boolean) => void
  sectionDialog: { open: boolean; editingId: number | null }
  openSectionDialog: (editingId: number | null) => void
  closeSectionDialog: () => void
  setGridlines: (gridlines: GridlineEntity[]) => void
  addGridline: (entity: Omit<GridlineEntity, 'id'>) => void
  updateGridline: (id: number, patch: Partial<Omit<GridlineEntity, 'id'>>) => void
  removeGridline: (id: number) => void
  setLevels: (levels: LevelEntity[]) => void
  addLevel: (entity: Omit<LevelEntity, 'id'>) => void
  updateLevel: (id: number, patch: Partial<Omit<LevelEntity, 'id'>>) => void
  removeLevel: (id: number) => void
  moveLevel: (id: number, direction: 'up' | 'down') => void
  results: ResultsState | null
  materialPreview: {
    running: boolean
    jobId: string | null
    points: { eps: number; sig: number }[]
    error: string | null
    panelOpen: boolean
    protocol: number[]
    inputMaterial: { matType: string; values: Record<string, unknown> } | null
  }
  activePanel: 'model' | 'analysis' | 'report'
  setActivePanel: (panel: 'model' | 'analysis' | 'report') => void
  activeRightPanel: 'command' | 'results'
  setActiveRightPanel: (panel: 'command' | 'results') => void

  // Carapace run
  carapaceRun: CarapaceRunState
  runCarapace: () => Promise<void>
  cancelCarapaceRun: () => void
  clearCarapaceRun: () => void

  // Model panel selection/editing
  selectedModelEntity: { kind: ModelDeletableKind; id: number } | null
  setSelectedModelEntity: (sel: { kind: ModelDeletableKind; id: number } | null) => void

  // Analysis panel selection/editing
  selectedAnalysisIndex: number | null
  analysisInsertionIndex: number | null
  setSelectedAnalysisIndex: (index: number | null) => void
  setAnalysisInsertionIndex: (index: number | null) => void

  // viewport node selection
  selectedNodeIds: number[]
  setSelectedNodeIds: (ids: number[]) => void
  toggleNodeInSelection: (id: number, additive: boolean) => void
  /** Scene -> properties: after a node click or marquee, show the one selected node in the command panel (or drop a stale node view). Model panel only, and not while a form is picking nodes. */
  selectNodesFromScene: () => void
  /** Scene -> properties: a clicked element becomes the selected model entity. */
  selectElementFromScene: (id: number) => void
  /** Scene -> properties: a click on empty space clears the node selection and a node/element properties view. */
  clearSceneSelection: () => void
  nodePickMode: 'none' | 'idlist' | 'vec-sequential'
  setNodePickMode: (mode: 'none' | 'idlist' | 'vec-sequential') => void
  pendingNodePick: number | null
  setPendingNodePick: (id: number | null) => void
  viewSettings: {
    showNodeIds: boolean
    showElementIds: boolean
    showNodes: boolean
    showElements: boolean
    showSupports: boolean
    showNodalLoads: boolean
    showElementLoads: boolean
    showLoadValues: boolean
    showGrid: boolean
    showGridlines: boolean
    showLevels: boolean
  }
  /** Pattern tags whose loads are hidden in the viewport; a pattern is shown unless listed, so new patterns appear by default. */
  hiddenLoadPatterns: number[]
  toggleLoadPatternVisible: (id: number) => void
  viewportAction: { kind: 'zoomIn' | 'zoomOut' | 'fit'; token: number } | null

  // results display (Display Results panel + scene)
  resultsView: ResultsView
  setResultsView: (patch: Partial<ResultsView>) => void

  // results plot overlay
  plotView: PlotView
  setPlotView: (patch: Partial<PlotView>) => void
  /** Append series (or replace them all); ids and colours are assigned here. */
  addPlotSeries: (specs: { y: Channel; x?: Channel; label?: string }[], replace?: boolean) => void
  updatePlotSeries: (id: string, patch: Partial<Omit<SeriesSpec, 'id'>>) => void
  removePlotSeries: (id: string) => void

  // report: saved plot configurations (config only; results are never stored). Cleared with the model.
  savedPlots: SavedPlot[]
  nextSavedPlotId: number
  /** The entry the open plot was saved to / loaded from; "Update" overwrites it. */
  activeSavedPlotId: number | null
  /** Saves the open plot as a new entry (becomes the active one). */
  savePlot: (name?: string) => void
  /** Overwrites an entry with the open plot. */
  updateSavedPlot: (id: number) => void
  /** Loads an entry into the plot overlay and opens it. */
  applySavedPlot: (id: number) => void
  renameSavedPlot: (id: number, name: string) => void
  deleteSavedPlot: (id: number) => void

  // Model actions
  initModel: (ndm: 2 | 3, ndf: number, extra?: { writes?: ModelWrite[]; analysisCommands?: AnalysisCommand[]; gridlines?: GridlineEntity[]; levels?: LevelEntity[] }) => void
  newModel: () => void
  writeModelEntity: (write: ModelWrite) => void
  previewDeleteModelEntity: (kind: ModelDeletableKind, id: number) => string[]
  deleteModelEntity: (kind: ModelDeletableKind, id: number) => void
  removeModelEntityChild: (parent: 'section' | 'pattern', parentId: number, childIndex: number) => void
  modelUndo: () => void
  modelRedo: () => void

  // Analysis actions
  pushAnalysisCommand: (cmd: AnalysisCommand) => void
  insertAnalysisCommandAt: (cmd: AnalysisCommand, index: number | null) => void
  updateAnalysisCommandAt: (index: number, cmd: AnalysisCommand) => void
  toggleAnalysisCommandDisabled: (index: number) => void
  moveAnalysisCommand: (fromIndex: number, toIndex: number) => void
  deleteAnalysisCommandAt: (index: number) => void
  analysisUndo: () => void
  analysisRedo: () => void

  setViewSetting: (key: keyof AppStore['viewSettings'], value: boolean) => void
  requestViewportAction: (kind: 'zoomIn' | 'zoomOut' | 'fit') => void
  importResults: (files: { name: string; data: string }[]) => void
  runMaterialPreview: (protocolOverride?: number[]) => void
  setMaterialPreviewPanelOpen: (open: boolean) => void
  setMaterialPreviewProtocol: (points: number[]) => void
  setMaterialPreviewInputMaterial: (input: { matType: string; values: Record<string, unknown> } | null) => void
  clearMaterialPreviewResult: () => void
}

function pushModelPast(past: Model[], model: Model): Model[] {
  const next = [...past, model]
  return next.length > MODEL_UNDO_DEPTH ? next.slice(next.length - MODEL_UNDO_DEPTH) : next
}

export const useAppStore = create<AppStore>((set, get) => {
  return ({
  model: emptyModel(),
  modelPast: [],
  modelFuture: [],
  analysisHistory: emptyAnalysisHistory(),
  gridlines: [],
  zeroTolerance: DEFAULT_ZERO_TOLERANCE,
  setZeroTolerance: (zeroTolerance) => set({ zeroTolerance }),
  nextGridlineId: 1,
  gridlinesDialogOpen: false,
  setGridlinesDialogOpen: (open) => set({ gridlinesDialogOpen: open }),
  materialDialogOpen: false,
  setMaterialDialogOpen: (open) => set({ materialDialogOpen: open }),
  sectionDialog: { open: false, editingId: null },
  openSectionDialog: (editingId) => set({ sectionDialog: { open: true, editingId } }),
  closeSectionDialog: () => set({ sectionDialog: { open: false, editingId: null } }),
  setGridlines: (gridlines) => set({
    gridlines,
    nextGridlineId: gridlines.reduce((max, g) => Math.max(max, g.id + 1), 1),
  }),
  addGridline: (entity) => set((s) => ({
    gridlines: [...s.gridlines, { ...entity, id: s.nextGridlineId }],
    nextGridlineId: s.nextGridlineId + 1,
  })),
  updateGridline: (id, patch) => set((s) => ({
    gridlines: s.gridlines.map((g) => (g.id === id ? { ...g, ...patch } : g)),
  })),
  removeGridline: (id) => set((s) => ({
    gridlines: s.gridlines.filter((g) => g.id !== id),
  })),
  levels: [],
  nextLevelId: 1,
  setLevels: (levels) => set({
    levels,
    nextLevelId: levels.reduce((max, l) => Math.max(max, l.id + 1), 1),
  }),
  addLevel: (entity) => set((s) => ({
    levels: [...s.levels, { ...entity, id: s.nextLevelId }],
    nextLevelId: s.nextLevelId + 1,
  })),
  updateLevel: (id, patch) => set((s) => ({
    levels: s.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  })),
  removeLevel: (id) => set((s) => ({
    levels: s.levels.filter((l) => l.id !== id),
  })),
  moveLevel: (id, direction) => set((s) => {
    const index = s.levels.findIndex((l) => l.id === id)
    if (index === -1) return s
    const target = direction === 'up' ? index + 1 : index - 1
    if (target < 0 || target >= s.levels.length) return s
    const next = [...s.levels]
    ;[next[index], next[target]] = [next[target], next[index]]
    return { levels: next }
  }),
  results: null,
  materialPreview: { running: false, jobId: null, points: [], error: null, panelOpen: false, protocol: [...DEFAULT_STRAIN_PROTOCOL], inputMaterial: null },
  activePanel: 'model',
  setActivePanel: (panel) => set({ activePanel: panel }),
  activeRightPanel: 'command',
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),

  carapaceRun: IDLE_CARAPACE_RUN,
  clearCarapaceRun: () => set({ carapaceRun: IDLE_CARAPACE_RUN }),
  cancelCarapaceRun: () => activeCarapaceCancel?.(),
  runCarapace: async () => {
    const { model, analysisHistory } = get()
    set({ carapaceRun: { status: 'compiling', diagnostics: [], result: null, error: null, progress: null, runId: null } })
    const { input, diagnostics, recordedNodeTags, dofsPerNode, recorderPlans, nodeTags } = compileInputV1(model, analysisHistory)
    if (!input) {
      set({ carapaceRun: { status: 'error', diagnostics, result: null, error: 'Compile failed — see diagnostics.', progress: null, runId: null } })
      return
    }
    const runId = nextCarapaceRunId()
    set((s) => ({ carapaceRun: { status: 'running', diagnostics, result: null, error: null, progress: null, runId }, resultsView: { ...s.resultsView, runId: null, caseStage: null, step: 0, stepFrac: 0, playing: false } }))
    const { promise, cancel } = runCarapaceOnWorker(runId, input, recordedNodeTags, dofsPerNode, recorderPlans, nodeTags, {
      onProgress: (progress) => set((s) => (s.carapaceRun.runId === runId ? { carapaceRun: { ...s.carapaceRun, progress } } : {})),
    })
    activeCarapaceCancel = cancel
    try {
      const result = await promise
      set((s) => ({
        carapaceRun: { status: result.error ? 'error' : 'done', diagnostics, result, error: result.error ? JSON.stringify(result.error) : null, progress: null, runId },
        // Show the finished run at its last step; first successful run also opens the panel on the deformed shape.
        // A run with only modal stages has no steps: it opens on the first mode shape instead.
        resultsView: result.sampleCount > 0
          ? { ...s.resultsView, runId, caseStage: null, step: result.sampleCount - 1, stepFrac: 0, open: true, type: s.resultsView.type === 'none' || s.resultsView.type === 'mode' ? 'deformed' : s.resultsView.type }
          : result.modalStageCount > 0 ? { ...s.resultsView, runId, step: 0, stepFrac: 0, mode: 0, caseStage: null, open: true, type: 'mode' } : s.resultsView,
      }))
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'cancelled'
      set({ carapaceRun: { status: cancelled ? 'cancelled' : 'error', diagnostics, result: null, error: cancelled ? null : String(error), progress: null, runId } })
    } finally {
      activeCarapaceCancel = null
    }
  },

  selectedModelEntity: null,
  // The scene highlights a selected node, so a node picked from the list (or deselected) keeps `selectedNodeIds` in step.
  setSelectedModelEntity: (sel) => set((s) => {
    if (sel?.kind === 'node') return { selectedModelEntity: sel, selectedNodeIds: [sel.id] }
    return { selectedModelEntity: sel, ...(s.selectedModelEntity?.kind === 'node' ? { selectedNodeIds: [] } : {}) }
  }),

  selectedAnalysisIndex: null,
  analysisInsertionIndex: null,
  setSelectedAnalysisIndex: (index) => set({ selectedAnalysisIndex: index }),
  setAnalysisInsertionIndex: (index) => set({ analysisInsertionIndex: index }),

  selectedNodeIds: [],
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  toggleNodeInSelection: (id, additive) => set((s) => {
    if (!additive) return { selectedNodeIds: [id] }
    const has = s.selectedNodeIds.includes(id)
    return { selectedNodeIds: has ? s.selectedNodeIds.filter((x) => x !== id) : [...s.selectedNodeIds, id] }
  }),
  selectNodesFromScene: () => set((s) => {
    if (s.activePanel !== 'model' || s.nodePickMode !== 'none') return s
    const ids = s.selectedNodeIds
    if (ids.length === 1 && s.model.nodes.has(ids[0])) return { selectedModelEntity: { kind: 'node', id: ids[0] } }
    return s.selectedModelEntity?.kind === 'node' ? { selectedModelEntity: null } : s
  }),
  selectElementFromScene: (id) => set((s) => (s.activePanel !== 'model' || s.nodePickMode !== 'none' ? s : { selectedModelEntity: { kind: 'element', id }, selectedNodeIds: [] })),
  clearSceneSelection: () => set((s) => {
    if (s.nodePickMode !== 'none') return s
    const kind = s.selectedModelEntity?.kind
    return { selectedNodeIds: [], ...(s.activePanel === 'model' && (kind === 'node' || kind === 'element') ? { selectedModelEntity: null } : {}) }
  }),
  nodePickMode: 'none',
  setNodePickMode: (mode) => set({ nodePickMode: mode }),
  pendingNodePick: null,
  setPendingNodePick: (id) => set({ pendingNodePick: id }),
  viewSettings: {
    showNodeIds: false,
    showElementIds: false,
    showNodes: true,
    showElements: true,
    showSupports: true,
    showNodalLoads: true,
    showElementLoads: true,
    showLoadValues: false,
    showGrid: true,
    showGridlines: true,
    showLevels: true,
  },
  hiddenLoadPatterns: [],
  toggleLoadPatternVisible: (id) => set((s) => ({ hiddenLoadPatterns: s.hiddenLoadPatterns.includes(id) ? s.hiddenLoadPatterns.filter((x) => x !== id) : [...s.hiddenLoadPatterns, id] })),
  viewportAction: null,
  resultsView: DEFAULT_RESULTS_VIEW,
  setResultsView: (patch) => set((s) => ({ resultsView: { ...s.resultsView, ...patch } })),

  plotView: DEFAULT_PLOT_VIEW,
  setPlotView: (patch) => set((s) => ({ plotView: { ...s.plotView, ...patch } })),
  addPlotSeries: (specs, replace = false) => set((s) => {
    let next = replace ? 1 : s.plotView.nextSeriesId
    const base = replace ? [] : s.plotView.series
    const added: SeriesSpec[] = specs.map((spec, i) => ({
      id: `s${next++}`, label: spec.label ?? '', color: SERIES_COLORS[(base.length + i) % SERIES_COLORS.length], visible: true,
      x: spec.x ?? s.plotView.x, y: spec.y,
    }))
    return { plotView: { ...s.plotView, series: [...base, ...added], nextSeriesId: next } }
  }),
  updatePlotSeries: (id, patch) => set((s) => ({ plotView: { ...s.plotView, series: s.plotView.series.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })),
  removePlotSeries: (id) => set((s) => ({ plotView: { ...s.plotView, series: s.plotView.series.filter((x) => x.id !== id) } })),

  savedPlots: [],
  nextSavedPlotId: 1,
  activeSavedPlotId: null,
  savePlot: (name) => set((s) => {
    if (!s.plotView.series.length) return s
    const config = snapshotPlot(s.plotView)
    const id = s.nextSavedPlotId
    const entry: SavedPlot = { kind: 'plot', id, name: uniqueName(name?.trim() || plotNameFor(config), s.savedPlots), config }
    return { savedPlots: [...s.savedPlots, entry], nextSavedPlotId: id + 1, activeSavedPlotId: id }
  }),
  updateSavedPlot: (id) => set((s) => (s.plotView.series.length && s.savedPlots.some((p) => p.id === id)
    ? { savedPlots: s.savedPlots.map((p) => (p.id === id ? { ...p, config: snapshotPlot(s.plotView) } : p)), activeSavedPlotId: id }
    : s)),
  applySavedPlot: (id) => set((s) => {
    const entry = s.savedPlots.find((p) => p.id === id)
    return entry ? { plotView: { ...s.plotView, ...restorePlot(entry.config) }, activeSavedPlotId: id } : s
  }),
  renameSavedPlot: (id, name) => set((s) => (name.trim() ? { savedPlots: s.savedPlots.map((p) => (p.id === id ? { ...p, name: uniqueName(name.trim(), s.savedPlots, id) } : p)) } : s)),
  deleteSavedPlot: (id) => set((s) => ({ savedPlots: s.savedPlots.filter((p) => p.id !== id), activeSavedPlotId: s.activeSavedPlotId === id ? null : s.activeSavedPlotId })),

  initModel: (ndm, ndf, extra) => set(() => {
    void clearAllRuns()
    let model = emptyModel()
    model = { ...model, config: { ndm, ndf } }
    for (const write of extra?.writes ?? []) model = applyModelWrite(model, write)
    const analysisCommands = extra?.analysisCommands ?? []
    const gridlines = extra?.gridlines ?? []
    const levels = extra?.levels ?? []
    return {
      model,
      modelPast: [],
      modelFuture: [],
      analysisHistory: { commands: analysisCommands, cursor: analysisCommands.length - 1 },
      gridlines,
      nextGridlineId: gridlines.reduce((max, g) => Math.max(max, g.id + 1), 1),
      levels,
      nextLevelId: levels.reduce((max, l) => Math.max(max, l.id + 1), 1),
      selectedModelEntity: null,
      selectedAnalysisIndex: null,
      analysisInsertionIndex: null,
      resultsView: DEFAULT_RESULTS_VIEW,
      plotView: DEFAULT_PLOT_VIEW,
      savedPlots: [],
      nextSavedPlotId: 1,
      activeSavedPlotId: null,
    }
  }),

  newModel: () => {
    void clearAllRuns()
    set({
      model: emptyModel(),
      modelPast: [],
      modelFuture: [],
      analysisHistory: emptyAnalysisHistory(),
      gridlines: [],
      nextGridlineId: 1,
      levels: [],
      nextLevelId: 1,
      selectedModelEntity: null,
      selectedAnalysisIndex: null,
      analysisInsertionIndex: null,
      selectedNodeIds: [],
      nodePickMode: 'none',
      pendingNodePick: null,
      results: null,
      resultsView: DEFAULT_RESULTS_VIEW,
      plotView: DEFAULT_PLOT_VIEW,
      savedPlots: [],
      nextSavedPlotId: 1,
      activeSavedPlotId: null,
    })
  },

  writeModelEntity: (write) => set((s) => ({
    model: applyModelWrite(s.model, write),
    modelPast: pushModelPast(s.modelPast, s.model),
    modelFuture: [],
  })),

  previewDeleteModelEntity: (kind, id) => previewDeleteEntity(get().model, kind, id),

  deleteModelEntity: (kind, id) => set((s) => ({
    model: deleteEntity(s.model, kind, id),
    modelPast: pushModelPast(s.modelPast, s.model),
    modelFuture: [],
    selectedModelEntity: s.selectedModelEntity?.kind === kind && s.selectedModelEntity.id === id ? null : s.selectedModelEntity,
  })),

  removeModelEntityChild: (parent, parentId, childIndex) => set((s) => ({
    model: removeModelChild(s.model, parent, parentId, childIndex),
    modelPast: pushModelPast(s.modelPast, s.model),
    modelFuture: [],
  })),

  modelUndo: () => set((s) => {
    if (s.modelPast.length === 0) return s
    const previous = s.modelPast[s.modelPast.length - 1]
    return {
      model: previous,
      modelPast: s.modelPast.slice(0, -1),
      modelFuture: [s.model, ...s.modelFuture],
    }
  }),

  modelRedo: () => set((s) => {
    if (s.modelFuture.length === 0) return s
    const [next, ...rest] = s.modelFuture
    return {
      model: next,
      modelPast: pushModelPast(s.modelPast, s.model),
      modelFuture: rest,
    }
  }),

  pushAnalysisCommand: (cmd) => set((s) => {
    const trimmed = s.analysisHistory.commands.slice(0, s.analysisHistory.cursor + 1)
    trimmed.push(cmd)
    return { analysisHistory: { commands: trimmed, cursor: trimmed.length - 1 }, selectedAnalysisIndex: null, analysisInsertionIndex: null }
  }),

  insertAnalysisCommandAt: (cmd, index) => set((s) => {
    const active = s.analysisHistory.commands.slice(0, s.analysisHistory.cursor + 1)
    const at = Math.max(0, Math.min(active.length, index ?? active.length))
    const commands = [...active.slice(0, at), cmd, ...active.slice(at)]
    return {
      analysisHistory: { commands, cursor: s.analysisHistory.cursor + 1 },
      selectedAnalysisIndex: null,
      analysisInsertionIndex: at + 1,
    }
  }),

  updateAnalysisCommandAt: (index, cmd) => set((s) => {
    if (index < 0 || index >= s.analysisHistory.commands.length) return s
    const commands = [...s.analysisHistory.commands]
    // Editing a command's parameters must not silently re-enable it.
    commands[index] = commands[index].disabled && cmd.disabled === undefined ? { ...cmd, disabled: true } : cmd
    return { analysisHistory: { ...s.analysisHistory, commands } }
  }),

  toggleAnalysisCommandDisabled: (index) => set((s) => {
    const old = s.analysisHistory.commands[index]
    if (!old) return s
    const commands = [...s.analysisHistory.commands]
    commands[index] = { ...old, disabled: old.disabled ? undefined : true }
    return { analysisHistory: { ...s.analysisHistory, commands } }
  }),

  moveAnalysisCommand: (fromIndex, toIndex) => set((s) => {
    if (fromIndex === toIndex) return s
    const { commands } = s.analysisHistory
    if (fromIndex < 0 || fromIndex >= commands.length) return s
    const to = Math.max(0, Math.min(commands.length, toIndex))
    const next = [...commands]
    const [item] = next.splice(fromIndex, 1)
    const insertAt = to > fromIndex ? to - 1 : to
    next.splice(insertAt, 0, item)

    let cursor = s.analysisHistory.cursor
    if (fromIndex <= cursor && insertAt > cursor) cursor -= 1
    else if (fromIndex > cursor && insertAt <= cursor) cursor += 1

    const remapIndex = (idx: number | null) => {
      if (idx === null) return null
      if (idx === fromIndex) return insertAt
      if (fromIndex < idx && idx < to) return idx - 1
      if (to <= idx && idx < fromIndex) return idx + 1
      return idx
    }

    return {
      analysisHistory: { commands: next, cursor },
      selectedAnalysisIndex: remapIndex(s.selectedAnalysisIndex),
      analysisInsertionIndex: to,
    }
  }),

  deleteAnalysisCommandAt: (index) => set((s) => {
    const { commands, cursor } = s.analysisHistory
    if (index < 0 || index >= commands.length) return s
    const next = commands.filter((_, i) => i !== index)
    const nextCursor = index <= cursor ? Math.max(-1, cursor - 1) : cursor
    return {
      analysisHistory: { commands: next, cursor: Math.min(nextCursor, next.length - 1) },
      selectedAnalysisIndex: null,
      analysisInsertionIndex: null,
    }
  }),

  analysisUndo: () => set((s) => ({ analysisHistory: { ...s.analysisHistory, cursor: Math.max(-1, s.analysisHistory.cursor - 1) } })),
  analysisRedo: () => set((s) => ({ analysisHistory: { ...s.analysisHistory, cursor: Math.min(s.analysisHistory.commands.length - 1, s.analysisHistory.cursor + 1) } })),

  setViewSetting: (key, value) => set((s) => ({ viewSettings: { ...s.viewSettings, [key]: value } })),

  requestViewportAction: (kind) => set((s) => ({ viewportAction: { kind, token: (s.viewportAction?.token ?? 0) + 1 } })),

  importResults: (files) => set({ results: { files } }),

  runMaterialPreview: (protocolOverride) => {
    const s = get()
    const input = s.materialPreview.inputMaterial
    if (!s.model.config) return
    if (!input) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Select or edit a uniaxialMaterial command first.' } }))
      return
    }
    const ctx = { ndm: s.model.config.ndm, ndf: s.model.config.ndf }
    const validation = validateUniaxialMaterialValues(input.values, ctx)
    if (validation) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: validation } }))
      return
    }
    const jobId = crypto.randomUUID()
    activePreviewJob = jobId
    const protocol = protocolOverride && protocolOverride.length ? protocolOverride : (s.materialPreview.protocol.length ? s.materialPreview.protocol : DEFAULT_STRAIN_PROTOCOL)
    set((prev) => ({ materialPreview: { ...prev.materialPreview, running: true, jobId, points: [], error: null, protocol } }))
    const material = { id: s.model.nextIds.material, kind: 'uniaxial' as const, matType: input.matType, args: input.values }
    runCarapaceMaterialPreview(material, protocol, { isCancelled: () => activePreviewJob !== jobId }).then(
      (points) => {
        if (activePreviewJob !== jobId) return
        activePreviewJob = null
        set((prev) => ({ materialPreview: { ...prev.materialPreview, running: false, points } }))
      },
      (error: unknown) => {
        if (activePreviewJob !== jobId) return
        activePreviewJob = null
        set((prev) => ({ materialPreview: { ...prev.materialPreview, running: false, error: error instanceof Error ? error.message : String(error) } }))
      },
    )
  },

  clearMaterialPreviewResult: () => {
    activePreviewJob = null
    set((s) => ({ materialPreview: { ...s.materialPreview, running: false, jobId: null, points: [], error: null } }))
  },

  setMaterialPreviewPanelOpen: (open) => set((s) => ({ materialPreview: { ...s.materialPreview, panelOpen: open } })),
  setMaterialPreviewProtocol: (points) => set((s) => ({ materialPreview: { ...s.materialPreview, protocol: points } })),
  setMaterialPreviewInputMaterial: (input) => {
    const prevSig = JSON.stringify(get().materialPreview.inputMaterial)
    const nextSig = JSON.stringify(input)
    const changed = prevSig !== nextSig
    if (changed) activePreviewJob = null
    set((s) => ({
      materialPreview: {
        ...s.materialPreview,
        inputMaterial: input,
        ...(changed ? { running: false, jobId: null, points: [], error: null } : {}),
      },
    }))
  },
  })
})

// Stored results describe the model and analysis sequence they were run on, and runs aren't hashed
// (see `runMetadataFor`), so any edit to either makes them stale: drop them rather than show a
// shape that no longer matches. Display preferences (type, scales, toggles) are kept.
useAppStore.subscribe((s, prev) => {
  if (s.model === prev.model && s.analysisHistory === prev.analysisHistory) return
  if (s.carapaceRun.status === 'running' || s.carapaceRun.status === 'compiling') s.cancelCarapaceRun()
  if (s.carapaceRun.status === 'idle' && s.resultsView.runId === null) return
  void clearAllRuns()
  useAppStore.setState({
    carapaceRun: s.carapaceRun.status === 'done' ? IDLE_CARAPACE_RUN : s.carapaceRun,
    resultsView: { ...s.resultsView, runId: null, caseStage: null, step: 0, stepFrac: 0, playing: false, open: false },
  })
})
