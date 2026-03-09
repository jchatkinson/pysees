import { create } from 'zustand'
import type { Command, CommandHistory } from '@/types/commands'
import type { AppMode, ModelConfig, ResultsState } from '@/types/model'
import { replay } from '@/lib/replay'
import { LocalAgentClient, type AgentConnectionState } from '@/lib/localAgent'
import { buildUniaxialMaterialCallArgs } from '@/lib/commandSchemas'

const DEFAULT_STRAIN_PROTOCOL = [0, 0.001, -0.001, 0.002, -0.002, 0.003, -0.003, 0]
const agentClient = new LocalAgentClient()

function producedNodeIds(cmd: Command): Set<number> {
  if (cmd.type === 'ADD_NODE') return new Set([cmd.id])
  if (cmd.type === 'SCRIPT_GROUP') {
    const ids = new Set<number>()
    for (const child of cmd.commands) for (const id of producedNodeIds(child)) ids.add(id)
    return ids
  }
  return new Set()
}

function dependsOnNodes(cmd: Command, nodeIds: Set<number>): boolean {
  if (nodeIds.size === 0) return false
  if ((cmd.type === 'FIX' || cmd.type === 'ADD_LOAD') && nodeIds.has(cmd.nodeId)) return true
  if (cmd.type === 'ADD_ELEMENT' && cmd.nodes.some((id) => nodeIds.has(id))) return true
  if (cmd.type === 'SCRIPT_GROUP') return cmd.commands.some((child) => dependsOnNodes(child, nodeIds))
  return false
}

function computeCascadeDeleteIndices(history: CommandHistory, index: number) {
  if (index < 0 || index >= history.commands.length) return []
  const activeEnd = history.cursor
  const remove = new Set<number>([index])
  const removedNodes = producedNodeIds(history.commands[index])

  for (let i = index + 1; i <= activeEnd; i += 1) {
    if (remove.has(i)) continue
    const cmd = history.commands[i]
    if (!cmd) continue
    if (!dependsOnNodes(cmd, removedNodes)) continue
    remove.add(i)
    for (const id of producedNodeIds(cmd)) removedNodes.add(id)
  }
  return [...remove].sort((a, b) => a - b)
}

function findAffectedIndices(commands: Command[], cursor: number, editedIndex: number, editedCommand: Command) {
  const affected: number[] = []
  if (editedIndex >= cursor) return affected
  if (editedCommand.type === 'ADD_NODE') {
    const nodeId = editedCommand.id
    for (let i = editedIndex + 1; i <= cursor; i += 1) {
      const cmd = commands[i]
      if (!cmd) continue
      if ((cmd.type === 'FIX' || cmd.type === 'ADD_LOAD') && cmd.nodeId === nodeId) affected.push(i)
      if (cmd.type === 'ADD_ELEMENT' && cmd.nodes.includes(nodeId)) affected.push(i)
    }
  }
  return affected
}

interface AppStore {
  history: CommandHistory
  mode: AppMode
  config: ModelConfig | null
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
    inputCommand: Command | null
  }
  selectedHistoryIndex: number | null
  insertionIndex: number | null
  lastEditedHistoryIndex: number | null
  affectedHistoryIndices: number[]
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
  initModel: (ndm: 2 | 3, ndf: number, extraCommands?: Command[]) => void
  pushCommand: (cmd: Command) => void
  insertCommandAt: (cmd: Command, index: number | null) => void
  updateCommandAt: (index: number, cmd: Command) => void
  moveCommand: (fromIndex: number, toIndex: number) => void
  previewDeleteCascade: (index: number) => number[]
  deleteCommandCascade: (index: number) => void
  setSelectedHistoryIndex: (index: number | null) => void
  setInsertionIndex: (index: number | null) => void
  undo: () => void
  redo: () => void
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
  setMaterialPreviewInputCommand: (cmd: Command | null) => void
  clearMaterialPreviewLogs: () => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  history: { commands: [], cursor: -1 },
  mode: 'model',
  config: null,
  results: null,
  localAgent: { status: 'disconnected', port: null, error: null },
  materialPreview: { running: false, jobId: null, points: [], error: null, logs: [], panelOpen: false, protocol: [...DEFAULT_STRAIN_PROTOCOL], inputCommand: null },
  selectedHistoryIndex: null,
  insertionIndex: null,
  lastEditedHistoryIndex: null,
  affectedHistoryIndices: [],
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

  initModel: (ndm, ndf, extraCommands) => set(() => {
    const initCmd: Command = { type: 'MODEL_INIT', ndm, ndf }
    const commands = [initCmd, ...(extraCommands ?? [])]
    return { config: { ndm, ndf }, history: { commands, cursor: commands.length - 1 }, selectedHistoryIndex: null, insertionIndex: null, lastEditedHistoryIndex: null, affectedHistoryIndices: [] }
  }),

  pushCommand: (cmd) => set((s) => {
    const trimmed = s.history.commands.slice(0, s.history.cursor + 1)
    trimmed.push(cmd)
    return { history: { commands: trimmed, cursor: trimmed.length - 1 }, selectedHistoryIndex: null, insertionIndex: null, lastEditedHistoryIndex: null, affectedHistoryIndices: [] }
  }),

  insertCommandAt: (cmd, index) => set((s) => {
    const active = s.history.commands.slice(0, s.history.cursor + 1)
    const at = Math.max(0, Math.min(active.length, index ?? active.length))
    const commands = [...active.slice(0, at), cmd, ...active.slice(at)]
    return {
      history: { commands, cursor: s.history.cursor + 1 },
      selectedHistoryIndex: null,
      insertionIndex: at + 1,
      lastEditedHistoryIndex: null,
      affectedHistoryIndices: [],
    }
  }),

  updateCommandAt: (index, cmd) => set((s) => {
    if (index < 0 || index >= s.history.commands.length) return s
    const commands = [...s.history.commands]
    commands[index] = cmd
    const affectedHistoryIndices = findAffectedIndices(commands, s.history.cursor, index, cmd)
    return { history: { ...s.history, commands }, lastEditedHistoryIndex: index, affectedHistoryIndices }
  }),

  moveCommand: (fromIndex, toIndex) => set((s) => {
    if (fromIndex === toIndex) return s
    if (fromIndex <= 0) return s // keep MODEL_INIT pinned
    const maxTo = s.history.commands.length
    if (fromIndex < 0 || fromIndex >= s.history.commands.length) return s
    const to = Math.max(1, Math.min(maxTo, toIndex))
    const commands = [...s.history.commands]
    const [item] = commands.splice(fromIndex, 1)
    const insertAt = to > fromIndex ? to - 1 : to
    commands.splice(insertAt, 0, item)

    // Remap an element's position after the move (used for selectedHistoryIndex)
    const remapElementIndex = (idx: number | null) => {
      if (idx === null) return null
      if (idx === fromIndex) return insertAt
      if (fromIndex < idx && idx < to) return idx - 1
      if (to <= idx && idx < fromIndex) return idx + 1
      return idx
    }

    // Cursor tracks the active/inactive boundary (count-based), not an element position.
    // Moving a command within the active range doesn't change the active count.
    let cursor = s.history.cursor
    if (fromIndex <= cursor && insertAt > cursor) cursor -= 1
    else if (fromIndex > cursor && insertAt <= cursor) cursor += 1

    return {
      history: { ...s.history, commands, cursor },
      selectedHistoryIndex: remapElementIndex(s.selectedHistoryIndex),
      insertionIndex: to,
      lastEditedHistoryIndex: null,
      affectedHistoryIndices: [],
    }
  }),

  previewDeleteCascade: (index) => computeCascadeDeleteIndices(get().history, index),

  deleteCommandCascade: (index) => set((s) => {
    const toDelete = computeCascadeDeleteIndices(s.history, index)
    if (toDelete.length === 0) return s
    const remove = new Set<number>(toDelete)
    const commands = s.history.commands.filter((_, i) => !remove.has(i))
    const removedBeforeCursor = [...remove].filter((i) => i <= s.history.cursor).length
    const cursor = Math.max(-1, Math.min(commands.length - 1, s.history.cursor - removedBeforeCursor))
    return {
      history: { commands, cursor },
      selectedHistoryIndex: null,
      insertionIndex: null,
      lastEditedHistoryIndex: null,
      affectedHistoryIndices: [],
    }
  }),

  setSelectedHistoryIndex: (index) => set({ selectedHistoryIndex: index }),
  setInsertionIndex: (index) => set({ insertionIndex: index }),

  undo: () => set((s) => ({
    history: { ...s.history, cursor: Math.max(0, s.history.cursor - 1) },
  })),

  redo: () => set((s) => ({
    history: { ...s.history, cursor: Math.min(s.history.commands.length - 1, s.history.cursor + 1) },
  })),

  setViewSetting: (key, value) => set((s) => ({ viewSettings: { ...s.viewSettings, [key]: value } })),

  requestViewportAction: (kind) => set((s) => ({ viewportAction: { kind, token: (s.viewportAction?.token ?? 0) + 1 } })),

  setMode: (mode) => set({ mode }),
  importResults: (files) => set({ results: { files } }),

  connectLocalAgent: async () => {
    set((s) => ({ localAgent: { ...s.localAgent, status: 'connecting', error: null } }))
    try {
      const port = await agentClient.connect()
      set({ localAgent: { status: 'connected', port, error: null } })
      agentClient.onEvent((event) => {
        if (event.type === 'job_started') {
          set((s) => ({ materialPreview: { ...s.materialPreview, running: true, jobId: event.jobId, points: [], error: null, logs: [] } }))
          return
        }
        if (event.type === 'point') {
          set((s) => {
            if (s.materialPreview.jobId !== event.jobId) return s
            return { materialPreview: { ...s.materialPreview, points: [...s.materialPreview.points, { eps: event.eps, sig: event.sig }] } }
          })
          return
        }
        if (event.type === 'job_error') {
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
          set((s) => {
            if (s.materialPreview.jobId !== event.jobId) return s
            return { materialPreview: { ...s.materialPreview, running: false } }
          })
        }
      })
      agentClient.onClose(() => set({ localAgent: { status: 'disconnected', port: null, error: null } }))
    } catch (error) {
      set({ localAgent: { status: 'error', port: null, error: String(error) } })
    }
  },

  disconnectLocalAgent: () => {
    agentClient.disconnect()
    set((s) => ({
      localAgent: { status: 'disconnected', port: null, error: null },
      materialPreview: { ...s.materialPreview, running: false, jobId: null, points: [], error: null, logs: [] },
    }))
  },

  runMaterialPreview: (protocolOverride) => {
    const s = get()
    const cmd = s.materialPreview.inputCommand
    if (!s.config) return
    if (!cmd) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Select or edit a uniaxialMaterial command first.' } }))
      return
    }
    if (s.localAgent.status !== 'connected') {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Connect to local agent first.' } }))
      return
    }
    if (cmd.type !== 'ADD_OPS' || cmd.fn !== 'uniaxialMaterial') {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Preview only supports uniaxialMaterial commands.' } }))
      return
    }
    const args = buildUniaxialMaterialCallArgs(cmd.values, { ndm: s.config.ndm, ndf: s.config.ndf }, replay(s.history).nextMatId)
    if (!args || args.length < 2) {
      set((prev) => ({ materialPreview: { ...prev.materialPreview, error: 'Material arguments are incomplete.' } }))
      return
    }
    const jobId = crypto.randomUUID()
    const protocol = protocolOverride && protocolOverride.length ? protocolOverride : (s.materialPreview.protocol.length ? s.materialPreview.protocol : DEFAULT_STRAIN_PROTOCOL)
    set((prev) => ({ materialPreview: { ...prev.materialPreview, running: true, jobId, points: [], error: null, logs: [], protocol } }))
    try {
      agentClient.runMaterial({
        jobId,
        materialCall: { fn: 'uniaxialMaterial', args },
        protocol: { strain: protocol },
        ndm: s.config.ndm,
        ndf: s.config.ndf,
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
      set((s) => ({ materialPreview: { ...s.materialPreview, running: false } }))
    }
  },

  setMaterialPreviewPanelOpen: (open) => set((s) => ({ materialPreview: { ...s.materialPreview, panelOpen: open } })),
  setMaterialPreviewProtocol: (points) => set((s) => ({ materialPreview: { ...s.materialPreview, protocol: points } })),
  setMaterialPreviewInputCommand: (cmd) => set((s) => ({ materialPreview: { ...s.materialPreview, inputCommand: cmd } })),
  clearMaterialPreviewLogs: () => set((s) => ({ materialPreview: { ...s.materialPreview, logs: [] } })),
}))

/** Derived model state — re-computes on every history change */
export const useModelState = () => replay(useAppStore((s) => s.history))
