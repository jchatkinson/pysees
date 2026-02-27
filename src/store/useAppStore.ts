import { create } from 'zustand'
import type { Command, CommandHistory } from '@/types/commands'
import type { AppMode, ModelConfig, ResultsState } from '@/types/model'
import { replay } from '@/lib/replay'

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
  lastEditedHistoryIndex: number | null
  affectedHistoryIndices: number[]
  initModel: (ndm: 2 | 3, ndf: number) => void
  pushCommand: (cmd: Command) => void
  updateCommandAt: (index: number, cmd: Command) => void
  setSelectedHistoryIndex: (index: number | null) => void
  undo: () => void
  redo: () => void
  setMode: (mode: AppMode) => void
  importResults: (files: { name: string; data: string }[]) => void
}

export const useAppStore = create<AppStore>((set) => ({
  history: { commands: [], cursor: -1 },
  mode: 'model',
  config: null,
  results: null,
  selectedHistoryIndex: null,
  lastEditedHistoryIndex: null,
  affectedHistoryIndices: [],

  initModel: (ndm, ndf) => set(() => {
    const cmd: Command = { type: 'MODEL_INIT', ndm, ndf }
    return { config: { ndm, ndf }, history: { commands: [cmd], cursor: 0 }, selectedHistoryIndex: null, lastEditedHistoryIndex: null, affectedHistoryIndices: [] }
  }),

  pushCommand: (cmd) => set((s) => {
    const trimmed = s.history.commands.slice(0, s.history.cursor + 1)
    trimmed.push(cmd)
    return { history: { commands: trimmed, cursor: trimmed.length - 1 }, selectedHistoryIndex: null, lastEditedHistoryIndex: null, affectedHistoryIndices: [] }
  }),

  updateCommandAt: (index, cmd) => set((s) => {
    if (index < 0 || index >= s.history.commands.length) return s
    const commands = [...s.history.commands]
    commands[index] = cmd
    const affectedHistoryIndices = findAffectedIndices(commands, s.history.cursor, index, cmd)
    return { history: { ...s.history, commands }, lastEditedHistoryIndex: index, affectedHistoryIndices }
  }),

  setSelectedHistoryIndex: (index) => set({ selectedHistoryIndex: index }),

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
