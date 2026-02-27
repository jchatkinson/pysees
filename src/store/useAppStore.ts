import { create } from 'zustand'
import type { Command, CommandHistory } from '@/types/commands'
import type { AppMode, ModelConfig, ResultsState } from '@/types/model'
import { replay } from '@/lib/replay'

interface AppStore {
  history: CommandHistory
  mode: AppMode
  config: ModelConfig | null
  results: ResultsState | null
  initModel: (ndm: 2 | 3, ndf: number) => void
  pushCommand: (cmd: Omit<Command, 'type'> & { type: Command['type'] }) => void
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

  initModel: (ndm, ndf) => set(() => {
    const cmd: Command = { type: 'MODEL_INIT', ndm, ndf }
    return { config: { ndm, ndf }, history: { commands: [cmd], cursor: 0 } }
  }),

  pushCommand: (cmd) => set((s) => {
    const trimmed = s.history.commands.slice(0, s.history.cursor + 1)
    trimmed.push(cmd as Command)
    return { history: { commands: trimmed, cursor: trimmed.length - 1 } }
  }),

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
