import { create } from 'zustand'
import type { Command, CommandHistory } from '@/types/commands'
import type { AppMode, ModelConfig, ResultsState } from '@/types/model'
import { replay } from '@/lib/replay'

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
  selectedHistoryIndex: number | null
  insertionIndex: number | null
  lastEditedHistoryIndex: number | null
  affectedHistoryIndices: number[]
  initModel: (ndm: 2 | 3, ndf: number) => void
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
  setMode: (mode: AppMode) => void
  importResults: (files: { name: string; data: string }[]) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  history: { commands: [], cursor: -1 },
  mode: 'model',
  config: null,
  results: null,
  selectedHistoryIndex: null,
  insertionIndex: null,
  lastEditedHistoryIndex: null,
  affectedHistoryIndices: [],

  initModel: (ndm, ndf) => set(() => {
    const cmd: Command = { type: 'MODEL_INIT', ndm, ndf }
    return { config: { ndm, ndf }, history: { commands: [cmd], cursor: 0 }, selectedHistoryIndex: null, insertionIndex: null, lastEditedHistoryIndex: null, affectedHistoryIndices: [] }
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

    const remapIndex = (idx: number | null) => {
      if (idx === null) return null
      if (idx === fromIndex) return insertAt
      if (fromIndex < idx && idx < to) return idx - 1
      if (to <= idx && idx < fromIndex) return idx + 1
      return idx
    }

    const cursorRaw = remapIndex(s.history.cursor)
    const cursor = cursorRaw === null ? s.history.cursor : cursorRaw
    return {
      history: { ...s.history, commands, cursor },
      selectedHistoryIndex: remapIndex(s.selectedHistoryIndex),
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

  setMode: (mode) => set({ mode }),
  importResults: (files) => set({ results: { files } }),
}))

/** Derived model state — re-computes on every history change */
export const useModelState = () => replay(useAppStore((s) => s.history))
