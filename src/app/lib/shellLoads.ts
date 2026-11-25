import type { ElementEntity, NodeEntity, PatternEntity, SectionEntity } from '@/app/types/model'
import { isShell } from '@/app/lib/commands/tables'
import { eleLoadKind, shellFrame } from '@/app/lib/shells'
import { isFloorAreaLoad, isJoistFloor, type FloorAreaLoadArgs } from '@/app/lib/floors'

type Vec3 = [number, number, number]

/** One pattern's load on a shell, as a global force per area: a pressure (along the shell normal) or a self-weight (density × thickness × acceleration). */
export interface ShellLoadPart { patternId: number; kind: 'pressure' | 'selfWeight' | 'floor'; vector: Vec3 }
export interface ShellAreaLoad { parts: ShellLoadPart[]; /** Global force per area, every part summed. */ total: Vec3; magnitude: number }

/** The area load every visible pattern puts on each shell, by element tag. A self-weight on a section without `rho` and `h` counts as zero. */
/** A part's component along the total load's direction: parts that act together share a sign (its own magnitude when the total is zero). */
export function alongTotal(part: ShellLoadPart, load: ShellAreaLoad): number {
  if (!(load.magnitude > 0)) return Math.hypot(...part.vector)
  return (part.vector[0] * load.total[0] + part.vector[1] * load.total[1] + part.vector[2] * load.total[2]) / load.magnitude
}

/** Where the total load points, in words: down / up for a mostly vertical (Z) load, else the dominant global axis. */
export function loadDirection(load: ShellAreaLoad): string {
  const [x, y, z] = load.total.map((v) => v / (load.magnitude || 1))
  if (Math.abs(z) >= 0.9) return z < 0 ? 'down' : 'up'
  const k = [x, y, z].map(Math.abs).reduce((best, v, i, a) => (v > a[best] ? i : best), 0)
  return `${[x, y, z][k] < 0 ? '−' : '+'}${'XYZ'[k]}`
}

export function shellAreaLoads(patterns: PatternEntity[], hiddenPatterns: number[], elements: Map<number, ElementEntity>, nodes: Map<number, NodeEntity>, sections: Map<number, SectionEntity>): Map<number, ShellAreaLoad> {
  const out = new Map<number, ShellAreaLoad>()
  for (const p of patterns) {
    if (hiddenPatterns.includes(p.id)) continue
    for (const c of p.children) {
      // A joist floor's area load (downward) counts like a pressure on the floor's outline.
      if (isFloorAreaLoad(c)) {
        const a = c.args as unknown as FloorAreaLoadArgs, ele = elements.get(a.floor)
        if (!ele || !isJoistFloor(ele.eleType)) continue
        const w = a.loads.reduce((sum, l) => sum + l.w, 0), load = out.get(a.floor) ?? { parts: [], total: [0, 0, 0], magnitude: 0 }
        load.parts.push({ patternId: p.id, kind: 'floor', vector: [0, 0, -w] })
        load.total[2] -= w
        load.magnitude = Math.hypot(...load.total)
        out.set(a.floor, load)
        continue
      }
      if (c.kind !== 'eleLoad') continue
      const kind = eleLoadKind(c.args)
      if (kind !== 'pressure' && kind !== 'selfWeight') continue
      const a = c.args as { eleTags?: number[]; pressure?: number; bx?: number; by?: number; bz?: number }
      for (const tag of a.eleTags ?? []) {
        const ele = elements.get(tag)
        if (!ele || !isShell(ele.eleType)) continue
        let value: number, dir: Vec3
        if (kind === 'pressure') {
          const xyz = ele.nodes.map((n) => nodes.get(n)?.coords)
          const frame = xyz.every(Boolean) ? shellFrame(xyz.map((q) => [q![0] ?? 0, q![1] ?? 0, q![2] ?? 0])) : null
          if (!frame) continue
          value = Number(a.pressure) || 0
          dir = frame.e3
        } else {
          const s = sections.get(Number(ele.args.secTag))?.args
          const b: Vec3 = [Number(a.bx) || 0, Number(a.by) || 0, Number(a.bz) || 0]
          value = (Number(s?.rho) || 0) * (Number(s?.h) || 0) * Math.hypot(...b)
          dir = value ? b.map((v) => v / Math.hypot(...b)) as Vec3 : [0, 0, 0]
        }
        const load = out.get(tag) ?? { parts: [], total: [0, 0, 0], magnitude: 0 }
        const vector = dir.map((d) => value * d) as Vec3
        load.parts.push({ patternId: p.id, kind, vector })
        for (let k = 0; k < 3; k++) load.total[k] += vector[k]
        load.magnitude = Math.hypot(...load.total)
        out.set(tag, load)
      }
    }
  }
  return out
}
