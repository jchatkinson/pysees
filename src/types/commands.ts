export type Command =
  | { type: 'MODEL_INIT'; ndm: number; ndf: number }
  | { type: 'ADD_NODE'; id: number; coords: number[] }
  | { type: 'ADD_MATERIAL'; id: number; matType: string; params: number[] }
  | { type: 'ADD_ELEMENT'; id: number; eleType: string; nodes: number[]; matId?: number }
  | { type: 'FIX'; nodeId: number; dofs: number[] }
  | { type: 'ADD_LOAD'; nodeId: number; values: number[] }
  | { type: 'ADD_RECORDER'; recorderType: string; params: object }
  | { type: 'SCRIPT_GROUP'; source: string; commands: Command[] }

export interface CommandHistory {
  commands: Command[]
  cursor: number // replay commands[0..cursor]; -1 = empty
}
