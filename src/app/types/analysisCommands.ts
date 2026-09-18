export type AnalysisCommand =
  | { type: 'ANALYSIS_OPS'; fn: string; values: Record<string, unknown> }
  | { type: 'ANALYSIS_BLOCK'; blockId: string; params: Record<string, unknown> }
  | { type: 'SCRIPT_GROUP'; source: string; commands: AnalysisCommand[] }

export interface AnalysisHistory {
  commands: AnalysisCommand[]
  cursor: number // replay commands[0..cursor] are "active"; -1 = empty
}

export function emptyAnalysisHistory(): AnalysisHistory {
  return { commands: [], cursor: -1 }
}
