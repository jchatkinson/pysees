import type { Command, CommandHistory } from '@/types/commands'
import type { ModelState } from '@/types/model'

function empty(): ModelState {
  return {
    config: null,
    nodes: new Map(),
    elements: new Map(),
    fixes: new Map(),
    loads: [],
    nextNodeId: 1,
    nextEleId: 1,
    nextMatId: 1,
  }
}

function apply(state: ModelState, cmd: Command): ModelState {
  switch (cmd.type) {
    case 'MODEL_INIT':
      return { ...state, config: { ndm: cmd.ndm as 2 | 3, ndf: cmd.ndf } }
    case 'ADD_NODE': {
      const nodes = new Map(state.nodes)
      nodes.set(cmd.id, { id: cmd.id, coords: cmd.coords })
      return { ...state, nodes, nextNodeId: Math.max(state.nextNodeId, cmd.id + 1) }
    }
    case 'ADD_ELEMENT': {
      const elements = new Map(state.elements)
      elements.set(cmd.id, { id: cmd.id, eleType: cmd.eleType, nodes: cmd.nodes, matId: cmd.matId })
      return { ...state, elements, nextEleId: Math.max(state.nextEleId, cmd.id + 1) }
    }
    case 'FIX': {
      const fixes = new Map(state.fixes)
      fixes.set(cmd.nodeId, { nodeId: cmd.nodeId, dofs: cmd.dofs })
      return { ...state, fixes }
    }
    case 'ADD_LOAD':
      return { ...state, loads: [...state.loads, { nodeId: cmd.nodeId, values: cmd.values }] }
    case 'ADD_MATERIAL': {
      return { ...state, nextMatId: Math.max(state.nextMatId, cmd.id + 1) }
    }
    case 'SCRIPT_GROUP':
      return cmd.commands.reduce(apply, state)
    case 'ADD_RECORDER':
    case 'ADD_OPS':
      return state
    default:
      return state
  }
}

export function replay(history: CommandHistory): ModelState {
  const active = history.commands.slice(0, history.cursor + 1)
  return active.reduce(apply, empty())
}
