import type { Model } from '@/app/types/model'
import { elementForceRecorders } from '@/app/lib/analysisBlocks'
import type { CarapaceRun } from '@/app/lib/commands/carapaceRunner'
import type { RecorderPlan } from '@/app/lib/carapace/compileInputV1'

export type Quantity = 'disp' | 'vel' | 'accel' | 'reaction' | 'force' | 'shell'

export interface Comparison {
  steps: { carapace: number; opensees: number }
  /** Scalar columns compared per quantity (a comparison that compared nothing proves nothing). */
  compared: Record<Quantity, number>
  /** Largest value of that quantity in OpenSees: the scale errors are judged against. */
  scale: Record<Quantity, number>
  /** Largest absolute difference over every compared column and step. */
  maxAbs: Record<Quantity, number>
  /** `maxAbs / scale`: what the tolerance applies to. */
  maxRel: Record<Quantity, number>
}

const table = (text: string) => text.trim().split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/).map(Number))
const zero = (): Record<Quantity, number> => ({ vel: 0, accel: 0, disp: 0, reaction: 0, force: 0, shell: 0 })

/** OpenSees' recorder files parsed once: node tables and the element force groups (see `elementForceRecorders`). */
export interface OpenSeesTables { nodes: number[]; ndf: number; node: Record<'disp' | 'vel' | 'accel' | 'reaction', number[][]>; forces: (ReturnType<typeof elementForceRecorders>[number] & { rows: number[][]; width: number })[] }

export function openseesTables(model: Model, files: Record<string, string>): OpenSeesTables {
  const forces = elementForceRecorders(model).map((g) => {
    const rows = table(files[g.file] ?? '')
    return { ...g, rows, width: rows.length ? (rows[0].length - 1) / g.eleTags.length : 0 }
  })
  const node = { disp: table(files['disp.out'] ?? ''), vel: table(files['vel.out'] ?? ''), accel: table(files['accel.out'] ?? ''), reaction: table(files['reaction.out'] ?? '') }
  return { nodes: [...model.nodes.keys()].sort((a, b) => a - b), ndf: model.config!.ndf, node, forces }
}

/** OpenSees' column for component `j` of a Carapace recorder plan, or undefined when OpenSees records no such value. */
export function openseesColumn(t: OpenSeesTables, plan: RecorderPlan, j: number): number[] | undefined {
  if (plan.kind === 'studWall') return undefined
  if (plan.kind === 'shell' || plan.kind === 'force') {
    // Shells: OpenSees' `stresses` response, 8 resultants per Gauss point, point after point, element after element.
    // Beams/trusses: Carapace appends the element's load components after its force columns; OpenSees has no such columns.
    const g = t.forces.find((f) => (plan.kind === 'shell') === (f.response === 'stresses') && f.eleTags.includes(plan.targetTag))
    return g && j < g.width ? g.rows.map((r) => r[1 + g.eleTags.indexOf(plan.targetTag) * g.width + j]) : undefined
  }
  const i = t.nodes.indexOf(plan.targetTag)
  return i < 0 ? undefined : t.node[plan.kind].map((r) => r[1 + i * t.ndf + j])
}

/** Rewrites an OpenSees column before it is compared (e.g. adds back loads the export moved out of an element). */
export type ColumnAdjust = (plan: RecorderPlan, j: number, column: number[], t: OpenSeesTables) => number[]

/** Rows (steps) of a run that belong to transient stages: the only ones where Carapace records velocity and acceleration. */
function transientRows(run: CarapaceRun): number[] | undefined {
  const stages = run.compile.input?.sequence.stages
  if (!run.stageOfStep || !stages || run.stageOfStep.length !== run.times.length) return undefined
  return run.stageOfStep.flatMap((s, i) => (stages[s]?.kind === 'transient' ? [i] : []))
}

/**
 * Lines up Carapace's recorded columns with the files the exported OpenSeesPy script wrote, by node / element tag, and measures how far
 * apart they are step by step. Carapace's columns are in `recorderPlans` order; OpenSees' are in the recorder commands' node / element order.
 * Velocity and acceleration are compared on transient steps only (OpenSees also writes rows for the static stages around them).
 */
export function compareRuns(model: Model, run: CarapaceRun, files: Record<string, string>, adjust?: ColumnAdjust): Comparison {
  const t = openseesTables(model, files)
  const dynamicRows = transientRows(run)
  const compared = zero(), scale = zero(), maxAbs = zero()
  for (const plan of run.compile.recorderPlans) {
    if (plan.kind === 'studWall') continue
    const quantity = plan.kind
    plan.componentLayout.forEach((_label, j) => {
      let mine = run.columns[plan.columnOffset + j]
      let theirs = openseesColumn(t, plan, j)
      if (!theirs || theirs.length !== mine.length) return
      if (adjust) theirs = adjust(plan, j, theirs, t)
      if ((quantity === 'vel' || quantity === 'accel') && dynamicRows) { mine = dynamicRows.map((i) => mine[i]); theirs = dynamicRows.map((i) => theirs![i]) }
      if (!mine.length) return
      compared[quantity]++
      scale[quantity] = Math.max(scale[quantity], ...theirs.map(Math.abs))
      maxAbs[quantity] = Math.max(maxAbs[quantity], ...mine.map((v, i) => Math.abs(v - theirs![i])))
    })
  }
  const maxRel = zero()
  for (const k of ['disp', 'vel', 'accel', 'reaction', 'force', 'shell'] as const) maxRel[k] = maxAbs[k] / Math.max(scale[k], 1e-12)
  return { steps: { carapace: run.times.length, opensees: t.node.disp.length }, compared, scale, maxAbs, maxRel }
}
