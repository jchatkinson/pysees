import { create } from 'zustand'
import type { AnalysisCommand, AnalysisHistory } from '@/app/types/analysisCommands'
import { emptyAnalysisHistory } from '@/app/types/analysisCommands'
import type { AppMode, Model, ResultsState } from '@/app/types/model'
import { emptyModel } from '@/app/types/model'
import { LocalAgentClient, type AgentConnectionState } from '@/app/lib/localAgent'
import { buildUniaxialMaterialCallArgs, validateUniaxialMaterialValues } from '@/app/lib/commandSchemas'
import { applyModelWrite, deleteEntity, previewDeleteEntity, removeModelChild, type ModelDeletableKind, type ModelWrite } from '@/app/lib/modelWrite'

const DEFAULT_STRAIN_PROTOCOL = [0, 0.001, -0.001, 0.002, -0.002, 0.003, -0.003, 0]
const agentClient = new LocalAgentClient()
const POINT_FLUSH_MS = 100
const MODEL_UNDO_DEPTH = 100

interface AppStore {
  model: Model
  modelPast: Model[]
  modelFuture: Model[]
  analysisHistory: AnalysisHistory
  mode: AppMode
  results: ResultsState | null
  localAgent: {
    status: AgentConnectionState
    port: number | null
    error: string | null
  }
  materialPreview: {
    running: boolean
    jobId: string | null
    points: { eps: number; sig: number }[]
    error: string | null
    logs: { stream: 'stdout' | 'stderr'; line: string }[]
    panelOpen: boolean
    protocol: number[]
    inputMaterial: { matType: string; values: Record<string, unknown> } | null
  }
  activePanel: 'model' | 'analysis'
  setActivePanel: (panel: 'model' | 'analysis') => void

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
    showGrid: boolean
  }
  viewportAction: { kind: 'zoomIn' | 'zoomOut' | 'fit'; token: number } | null

  // Model actions
  initModel: (ndm: 2 | 3, ndf: number, extra?: { writes?: ModelWrite[]; analysisCommands?: AnalysisCommand[] }) => void
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
  moveAnalysisCommand: (fromIndex: number, toIndex: number) => void
  deleteAnalysisCommandAt: (index: number) => void
  analysisUndo: () => void
  analysisRedo: () => void

  setViewSetting: (key: keyof AppStore['viewSettings'], value: boolean) => void
  requestViewportAction: (kind: 'zoomIn' | 'zoomOut' | 'fit') => void
  setMode: (mode: AppMode) => void
  importResults: (files: { name: string; data: string }[]) => void
  connectLocalAgent: () => Promise<void>
  disconnectLocalAgent: () => void
  runMaterialPreview: (protocolOverride?: number[]) => void
  cancelMaterialPreview: () => void
  setMaterialPreviewPanelOpen: (open: boolean) => void
  setMaterialPreviewProtocol: (points: number[]) => void
  setMaterialPreviewInputMaterial: (input: { matType: string; values: Record<string, unknown> } | null) => void
  clearMaterialPreviewResult: () => void
  clearMaterialPreviewLogs: () => void
}

function pushModelPast(past: Model[], model: Model): Model[] {
  const next = [...past, model]
  return next.length > MODEL_UNDO_DEPTH ? next.slice(next.length - MODEL_UNDO_DEPTH) : next
}

export const useAppStore = create<AppStore>((set, get) => {
  let bufferedPoints: { eps: number; sig: number }[] = []
  let bufferedJobId: string | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const clearFlushTimer = () => {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const resetBufferedPoints = () => {
    clearFlushTimer()
    bufferedPoints = []
    bufferedJobId = null
  }

  const flushBufferedPoints = (jobId?: string) => {
    if (bufferedPoints.length === 0 || !bufferedJobId) return
    if (jobId && bufferedJobId !== jobId) return
    const activeJobId = bufferedJobId
    const batch = bufferedPoints
    bufferedPoints = []
    set((s) => {
      if (s.materialPreview.jobId !== activeJobId) return s
      return { materialPreview: { ...s.materialPreview, points: s.materialPreview.points.concat(batch) } }
    })
  }

  const queueBufferedPoint = (jobId: string, point: { eps: number; sig: number }) => {
    if (get().materialPreview.jobId !== jobId) return
    if (bufferedJobId && bufferedJobId !== jobId) resetBufferedPoints()
    bufferedJobId = jobId
    bufferedPoints.push(point)
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushBufferedPoints()
      }, POINT_FLUSH_MS)
    }
  }

  return ({
  model: emptyModel(),
  modelPast: [],
  modelFuture: [],
  analysisHistory: emptyAnalysisHistory(),
  mode: 'model',
  results: null,
  localAgent: { status: 'disconnected', port: null, error: null },
  materialPreview: { running: false, jobId: null, points: [], error: null, logs: [], panelOpen: false, protocol: [...DEFAULT_STRAIN_PROTOCOL], inputMaterial: null },
  activePanel: 'model',
  setActivePanel: (panel) => set({ activePanel: panel }),

  selectedModelEntity: null,
  setSelectedModelEntity: (sel) => set({ selectedModelEntity: sel }),

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
    showGrid: true,
  },
  viewportAction: null,

  initModel: (ndm, ndf, extra) => set(() => {
    let model = emptyModel()
    model = { ...model, config: { ndm, ndf } }
    for (const write of extra?.writes ?? []) model = applyModelWrite(model, write)
    const analysisCommands = extra?.analysisCommands ?? []
    return {
      model,
      modelPast: [],
      modelFuture: [],
      analysisHistory: { commands: analysisCommands, cursor: analysisCommands.length - 1 },
      selectedModelEntity: null,
      selectedAnalysisIndex: null,
      analysisInsertionIndex: null,
    }
  }),

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
    commands[index] = cmd
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

  setMode: (mode) => set({ mode }),
  importResults: (files) => set({ results: { files } }),

  connectLocalAgent: async () => {
    resetBufferedPoints()
    set((s) => ({ localAgent: { ...s.localAgent, status: 'connecting', error: null } }))
    try {
      const port = await agentClient.connect()
      set({ localAgent: { status: 'connected', port, error: null } })
      agentClient.onEvent((event) => {
        if (event.type === 'job_started') {
          resetBufferedPoints()
          set((s) => ({ materialPreview: { ...s.materialPreview, running: true, jobId: event.jobId, points: [], error: null, logs: [] } }))
          return
        }
        if (event.type === 'point') {
          queueBufferedPoint(event.jobId, { eps: event.eps, sig: event.sig })
          return
        }
        if (event.type === 'job_error') {
          clearFlushTimer()
          flushBufferedPoints(event.jobId)
          resetBufferedPoints()
          set((s) => {
            if (s.materialPreview.jobId !== event.jobId) return s
            return { materialPreview: { ...s.materialPreview, running: false, error: `${event.code}: ${event.message}` } }
          })
          return
        }
        if (event.type === 'job_log') {
          set((s) => ({ materialPreview: { ...s.materialPreview, logs: [...s.materialPreview.logs, { stream: event.stream, line: event.line }] } }))
          return
        }
        if (event.type === 'job_finished') {
          clearFlushTimer()
          flushBufferedPoints(event.jobId)
          resetBufferedPoints()
          set((s) => {
            if (s.materialPreview.jobId !== event.jobId) return s
            return { materialPreview: { ...s.materialPreview, running: false } }
          })
        }
      })
      agentClient.onClose(() => {
        resetBufferedPoints()
        set({ localAgent: { status: 'disconnected', port: null, error: null } })
      })
    } catch (error) {
      set({ localAgent: { status: 'error', port: null, error: String(error) } })
    }
  },

  disconnectLocalAgent: () => {
    resetBufferedPoints()
    agentClient.disconnect()
    set((s) => ({
      localAgent: { status: 'disconnected', port: null, error: null },
      materialPreview: { ...s.materialPreview, running: false, jobId: null, points: [], error: null, logs: [] },
    }))
  },

  runMaterialPreview: (protocolOverride) => {
    const s = get()
    const input = s.materialPreview.inputMaterial
    if (!s.model.config) return
    if (!input) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Select or edit a uniaxialMaterial command first.' } }))
      return
    }
    if (s.localAgent.status !== 'connected') {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Connect to local agent first.' } }))
      return
    }
    const ctx = { ndm: s.model.config.ndm, ndf: s.model.config.ndf }
    const validation = validateUniaxialMaterialValues(input.values, ctx)
    if (validation) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: validation } }))
      return
    }
    const args = buildUniaxialMaterialCallArgs(input.values, ctx, s.model.nextIds.material)
    if (!args || args.length < 2) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Material arguments are incomplete.' } }))
      return
    }
    const jobId = crypto.randomUUID()
    const protocol = protocolOverride && protocolOverride.length ? protocolOverride : (s.materialPreview.protocol.length ? s.materialPreview.protocol : DEFAULT_STRAIN_PROTOCOL)
    resetBufferedPoints()
    set((prev) => ({ materialPreview: { ...prev.materialPreview, running: true, jobId, points: [], error: null, logs: [], protocol } }))
    try {
      agentClient.runMaterial({
        jobId,
        materialCall: { fn: 'uniaxialMaterial', args },
        protocol: { strain: protocol },
        ndm: ctx.ndm,
        ndf: ctx.ndf,
      })
    } catch (error) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, running: false, error: String(error) } }))
    }
  },

  cancelMaterialPreview: () => {
    const jobId = get().materialPreview.jobId
    if (!jobId) return
    try {
      agentClient.cancelJob(jobId)
    } finally {
      resetBufferedPoints()
      set((s) => ({ materialPreview: { ...s.materialPreview, running: false } }))
    }
  },

  clearMaterialPreviewResult: () => {
    resetBufferedPoints()
    set((s) => ({ materialPreview: { ...s.materialPreview, running: false, jobId: null, points: [], error: null } }))
  },

  setMaterialPreviewPanelOpen: (open) => set((s) => ({ materialPreview: { ...s.materialPreview, panelOpen: open } })),
  setMaterialPreviewProtocol: (points) => set((s) => ({ materialPreview: { ...s.materialPreview, protocol: points } })),
  setMaterialPreviewInputMaterial: (input) => {
    const prevSig = JSON.stringify(get().materialPreview.inputMaterial)
    const nextSig = JSON.stringify(input)
    const changed = prevSig !== nextSig
    if (changed) resetBufferedPoints()
    set((s) => ({
      materialPreview: {
        ...s.materialPreview,
        inputMaterial: input,
        ...(changed ? { running: false, jobId: null, points: [], error: null } : {}),
      },
    }))
  },
  clearMaterialPreviewLogs: () => set((s) => ({ materialPreview: { ...s.materialPreview, logs: [] } })),
  })
})
