import type { ModelWrite } from '@/app/lib/modelWrite'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import type { GridlineEntity } from '@/app/types/gridlines'
import type { LevelEntity } from '@/app/types/levels'
import type { CaseModel } from '../types'

/**
 * Transfer slab for an ETABS comparison (kip, in). A 20 × 20 ft slab, 36 in thick (ShellMITC4, so thick-plate / Reissner–Mindlin like ETABS
 * Shell-Thick), on four 24 × 24 in columns 10 ft long, fixed at their bases and inset 2 ft from each corner. A 24 × 24 in transfer column,
 * 10 ft long, stands on the slab off-centre toward the (2 ft, 2 ft) corner column and carries 1000 kip down at its free top. Linear elastic,
 * no self-weight (rho = 0). The slab is meshed `mesh` in square, so every column lands on a slab node.
 */
export const TRANSFER_SLAB = { E: 4000, nu: 0.2, h: 36, side: 240, inset: 24, story: 120, col: 24, load: 1000, transfer: [72, 96] as [number, number] }

/** `footprint`: each column head is tied by `rigidLink beam`s to every slab node inside its col × col footprint, so the slab is not loaded at a single node. */
export function transferSlab(mesh = 12, { footprint = false, h = TRANSFER_SLAB.h } = {}): CaseModel & { bases: number[]; top: number } {
  const { E, nu, side, inset, story, col, load, transfer } = TRANSFER_SLAB
  const n = side / mesh
  if (!Number.isInteger(n) || [inset, col / 2, ...transfer].some((v) => v % mesh)) throw new Error(`a ${mesh} in mesh does not put every column on a slab node`)
  const slab = (x: number, y: number) => (y / mesh) * (n + 1) + x / mesh + 1
  const writes: ModelWrite[] = []
  for (let k = 0; k <= n; k++) for (let i = 0; i <= n; i++) writes.push({ kind: 'node', entity: { id: slab(i * mesh, k * mesh), coords: [i * mesh, k * mesh, story] } })
  const G = E / (2 * (1 + nu)), A = col * col, I = col ** 4 / 12, J = 0.1406 * col ** 4
  const column = { A, E, G, J, Iy: I, Iz: I, transfTag: 1 }
  writes.push(
    { kind: 'geomTransf', entity: { id: 1, transfType: 'Linear', args: { type: 'Linear', transfTag: 1, vecxz: [1, 0, 0] } } },
    { kind: 'section', entity: { id: 1, secType: 'ElasticMembranePlateSection', args: { type: 'ElasticMembranePlateSection', secTag: 1, eMod: E, nu, h, rho: 0 }, children: [] } },
  )
  let id = (n + 1) ** 2 + 1, ele = 1
  const supports: [number, number][] = [[inset, inset], [side - inset, inset], [side - inset, side - inset], [inset, side - inset]]
  const bases: number[] = []
  for (const [x, y] of supports) {
    bases.push(id)
    writes.push({ kind: 'node', entity: { id, coords: [x, y, 0] } }, { kind: 'fix', entity: { nodeId: id, dofs: [1, 2, 3, 4, 5, 6] } })
    writes.push({ kind: 'element', entity: { id: ele++, eleType: 'ElasticBeamColumn', nodes: [id++, slab(x, y)], args: column } })
  }
  const top = id
  writes.push({ kind: 'node', entity: { id: top, coords: [...transfer, 2 * story] } })
  writes.push({ kind: 'element', entity: { id: ele++, eleType: 'ElasticBeamColumn', nodes: [slab(...transfer), top], args: column } })
  let mp = 1
  if (footprint) for (const [cx, cy] of [...supports, transfer]) for (let dy = -col / 2; dy <= col / 2; dy += mesh) for (let dx = -col / 2; dx <= col / 2; dx += mesh) {
    if (dx || dy) writes.push({ kind: 'mpConstraint', entity: { id: mp++, kind: 'rigidLink', args: { type: 'beam', rNodeTag: slab(cx, cy), cNodeTag: slab(cx + dx, cy + dy) } } })
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const [x, y] = [i * mesh, k * mesh]
    writes.push({ kind: 'element', entity: { id: ele++, eleType: 'ShellMITC4', nodes: [slab(x, y), slab(x + mesh, y), slab(x + mesh, y + mesh), slab(x, y + mesh)], args: { secTag: 1 } } })
  }
  writes.push(
    { kind: 'timeSeries', entity: { id: 1, tsType: 'Linear', args: { type: 'Linear', tag: 1, factor: 1 } } },
    { kind: 'pattern', entity: { id: 1, name: 'Transfer load', patternType: 'Plain', args: { type: 'Plain', patternTag: 1, tsTag: 1, fact: 1 }, children: [{ kind: 'load', args: { nodeTag: top, values: [0, 0, -load, 0, 0, 0] } }] } },
  )
  const model = modelFromWrites(3, 6, writes)
  model.config = { ...model.config!, units: { length: 'in', force: 'kip', time: 's' } }
  const history = { commands: [{ type: 'ANALYSIS_BLOCK', blockId: 'whole-model-recorder', params: { directory: 'out' } }, { type: 'ANALYSIS_BLOCK', blockId: 'run-gravity-analysis', params: { patterns: [1], steps: 1 } }], cursor: 1 } as CaseModel['history']
  const levels: LevelEntity[] = [{ id: 1, label: 'Base', height: 0 }, { id: 2, label: 'Transfer', height: story }, { id: 3, label: 'Top', height: story }]
  const gridlines: GridlineEntity[] = [inset, side - inset].flatMap((c, i) => [
    { id: i + 1, label: String(i + 1), start: [c, -inset], end: [c, side + inset] },
    { id: i + 3, label: 'AB'[i], start: [-inset, c], end: [side + inset, c] },
  ])
  return { model, history, levels, gridlines, bases, top }
}
