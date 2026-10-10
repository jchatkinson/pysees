import type { Model } from '@/app/types/model'
import { elementForceRecorders } from '@/app/lib/analysisBlocks'
import type { CarapaceRun } from '@/app/lib/commands/carapaceRunner'

export type Quantity = 'disp' | 'reaction' | 'force' | 'shell'

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
const zero = (): Record<Quantity, number> => ({ disp: 0, reaction: 0, force: 0, shell: 0 })

/**
 * Lines up Carapace's recorded columns with the files the exported OpenSeesPy script wrote, by node / element tag, and measures how far
 * apart they are step by step. Carapace's columns are in `recorderPlans` order; OpenSees' are in the recorder commands' node / element order.
 */
export function compareRuns(model: Model, run: CarapaceRun, files: Record<string, string>): Comparison {
  const ndf = model.config!.ndf
  const nodes = [...model.nodes.keys()].sort((a, b) => a - b)
  const disp = table(files['disp.out'] ?? '')
  const reaction = table(files['reaction.out'] ?? '')
  // Element forces: one file per OpenSees response (see elementForceRecorders), `width` columns per element.
  const forces = elementForceRecorders(model).map((g) => {
    const rows = table(files[g.file] ?? '')
    return { ...g, rows, width: rows.length ? (rows[0].length - 1) / g.eleTags.length : 0 }
  })

  const compared = zero(), scale = zero(), maxAbs = zero()
  for (const plan of run.compile.recorderPlans) {
    plan.componentLayout.forEach((_label, j) => {
      const mine = run.columns[plan.columnOffset + j]
      let theirs: number[] | undefined
      if (plan.kind === 'shell') {
        // OpenSees' `stresses` response: 8 resultants per Gauss point, point after point, for each element in turn.
        const g = forces.find((f) => f.response === 'stresses' && f.eleTags.includes(plan.targetTag))
        if (g && j < g.width) theirs = g.rows.map((r) => r[1 + g.eleTags.indexOf(plan.targetTag) * g.width + j])
      } else if (plan.kind === 'force') {
        const g = forces.find((f) => f.response !== 'stresses' && f.eleTags.includes(plan.targetTag))
        // Carapace appends the element's load components after its 6 force columns; OpenSees has no such columns.
        if (g && j < g.width) theirs = g.rows.map((r) => r[1 + g.eleTags.indexOf(plan.targetTag) * g.width + j])
      } else {
        const rows = plan.kind === 'disp' ? disp : reaction
        theirs = rows.map((r) => r[1 + nodes.indexOf(plan.targetTag) * ndf + j])
      }
      if (!theirs || theirs.length !== mine.length) return
      compared[plan.kind]++
      scale[plan.kind] = Math.max(scale[plan.kind], ...theirs.map(Math.abs))
      maxAbs[plan.kind] = Math.max(maxAbs[plan.kind], ...mine.map((v, i) => Math.abs(v - theirs![i])))
    })
  }
  const maxRel = zero()
  for (const k of ['disp', 'reaction', 'force', 'shell'] as const) maxRel[k] = maxAbs[k] / Math.max(scale[k], 1e-12)
  return { steps: { carapace: run.times.length, opensees: disp.length }, compared, scale, maxAbs, maxRel }
}
