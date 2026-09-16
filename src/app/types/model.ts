export interface ModelConfig { ndm: 2 | 3; ndf: number }

export interface NodeState { id: number; coords: number[] }
export interface ElementState { id: number; eleType: string; nodes: number[]; matId?: number }
export interface FixState { nodeId: number; dofs: number[] }
export interface LoadState { nodeId: number; values: number[] }

export interface ModelState {
  config: ModelConfig | null
  nodes: Map<number, NodeState>
  elements: Map<number, ElementState>
  fixes: Map<number, FixState>
  loads: LoadState[]
  nextNodeId: number
  nextEleId: number
  nextMatId: number
}

export interface ResultsState {
  files: { name: string; data: string }[]
}

export type AppMode = 'model' | 'results'
