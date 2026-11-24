import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './useAppStore'
import type { ModelWrite } from '@/app/lib/modelWrite'

// The store clears stored results through the IndexedDB worker; nothing here reads results.
vi.mock('@/app/lib/resultsStorage/resultsStorageClient', async (orig) => {
  const mod = await orig<Record<string, unknown>>()
  return Object.fromEntries(Object.entries(mod).map(([k, v]) => [k, typeof v === 'function' ? () => Promise.resolve() : v]))
})

const st = () => useAppStore.getState()
const node = (id: number, x: number): ModelWrite => ({ kind: 'node', entity: { id, coords: [x, 0, 0] } })
const truss = (id: number, a: number, b: number): ModelWrite => ({ kind: 'element', entity: { id, eleType: 'Truss', nodes: [a, b], args: {} } })

beforeEach(() => {
  st().initModel(3, 6)
  st().setActivePanel('model')
})

describe('writeModelEntities', () => {
  it('applies a batch as one undo step', () => {
    st().writeModelEntities([node(1, 0), node(2, 1), truss(1, 1, 2)])
    expect(st().model.nodes.size).toBe(2)
    expect(st().model.elements.size).toBe(1)
    expect(st().modelPast).toHaveLength(1)
    st().modelUndo()
    expect(st().model.nodes.size).toBe(0)
    expect(st().model.elements.size).toBe(0)
  })

  it('ignores an empty batch', () => {
    st().writeModelEntities([])
    expect(st().modelPast).toHaveLength(0)
  })
})

describe('scene selection', () => {
  beforeEach(() => st().writeModelEntities([node(1, 0), node(2, 1), node(3, 2), truss(1, 1, 2), truss(2, 2, 3)]))

  it('one object drives the properties panel; several do not', () => {
    st().setSceneSelection({ nodes: [], elements: [1] })
    expect(st().selectedModelEntity).toEqual({ kind: 'element', id: 1 })
    st().setSceneSelection({ nodes: [3], elements: [] }, true)
    expect(st().selectedElementIds).toEqual([1])
    expect(st().selectedNodeIds).toEqual([3])
    expect(st().selectedModelEntity).toBeNull()
  })

  it('additive element clicks toggle', () => {
    st().selectElementFromScene(1)
    st().selectElementFromScene(2, true)
    expect(st().selectedElementIds).toEqual([1, 2])
    st().selectElementFromScene(1, true)
    expect(st().selectedElementIds).toEqual([2])
    expect(st().selectedModelEntity).toEqual({ kind: 'element', id: 2 })
  })

  it('select all and clear', () => {
    st().selectAll()
    expect(st().selectedNodeIds).toHaveLength(3)
    expect(st().selectedElementIds).toHaveLength(2)
    st().clearSceneSelection()
    expect(st().selectedNodeIds).toEqual([])
    expect(st().selectedElementIds).toEqual([])
  })

  it('a form picking nodes only ever selects nodes', () => {
    st().setNodePickMode('idlist')
    st().setSceneSelection({ nodes: [1, 2], elements: [1] })
    expect(st().selectedNodeIds).toEqual([1, 2])
    expect(st().selectedElementIds).toEqual([])
    st().setNodePickMode('none')
  })

  it('deleting an element drops it from the selection', () => {
    st().setSceneSelection({ nodes: [], elements: [1, 2] })
    st().deleteModelEntity('element', 1)
    expect(st().selectedElementIds).toEqual([2])
  })
})

describe('deleteSelection', () => {
  beforeEach(() => st().writeModelEntities([node(1, 0), node(2, 1), node(3, 2), truss(1, 1, 2), truss(2, 2, 3)]))
  it('deletes elements and nodes (taking their members) as one undo step', () => {
    st().setSceneSelection({ nodes: [3], elements: [1] })
    const past = st().modelPast.length
    st().deleteSelection()
    expect([...st().model.elements.keys()]).toEqual([])
    expect([...st().model.nodes.keys()]).toEqual([1, 2])
    expect(st().modelPast.length).toBe(past + 1)
    expect(st().selectedElementIds).toEqual([])
    st().modelUndo()
    expect(st().model.elements.size).toBe(2)
  })
})
