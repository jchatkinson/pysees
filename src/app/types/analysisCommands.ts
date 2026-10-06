/** `disabled` temporarily takes a command out of the sequence — it is skipped by Carapace runs and script export, as if removed. */
export type AnalysisCommand = { disabled?: boolean } & (
  | { type: 'ANALYSIS_OPS'; fn: string; values: Record<string, unknown> }
  | { type: 'ANALYSIS_BLOCK'; blockId: string; params: Record<string, unknown> }
  | { type: 'SCRIPT_GROUP'; source: string; commands: AnalysisCommand[] }
)

export interface AnalysisHistory {
  commands: AnalysisCommand[]
  cursor: number // replay commands[0..cursor] are "active"; -1 = empty
}

export function emptyAnalysisHistory(): AnalysisHistory {
  return { commands: [], cursor: -1 }
}
