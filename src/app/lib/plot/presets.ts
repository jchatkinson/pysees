import type { Model } from '@/app/types/model'
import type { Channel } from '@/app/types/plotView'
import type { AvailableTargets } from './channels'

export interface PlotPreset {
  id: string
  label: string
  /** One short line shown under the label in the menu. */
  hint: string
  /** Null when the run lacks the data this preset needs. */
  build: (ctx: PresetContext) => { x: Channel; series: { y: Channel }[] } | null
}

export interface PresetContext {
  targets: AvailableTargets
  model: Model
  selectedNodeIds: number[]
}

const pick = (components: string[], prefer: string) => (components.includes(prefer) ? prefer : components[0])

const response = (kind: 'disp' | 'reaction' | 'force', component: string, mode: 'single' | 'sum' | 'difference', tags: number[], scale = 1): Channel =>
  ({ type: 'response', kind, component, mode, tags, scale })

/** Selected nodes that have recorded displacements, else the first recorded node. */
function nodesFor(ctx: PresetContext): number[] {
  const have = new Set(ctx.targets.disp.tags)
  const sel = ctx.selectedNodeIds.filter((t) => have.has(t))
  return sel.length ? sel : ctx.targets.disp.tags.slice(0, 1)
}

/** The node furthest along the vertical axis (y for planar models, z for spatial) — the usual pushover control node. */
function roofNode(ctx: PresetContext): number | null {
  const up = ctx.model.config?.ndm === 3 ? 2 : 1
  let best: number | null = null
  let bestV = -Infinity
  for (const t of ctx.targets.disp.tags) {
    const v = ctx.model.nodes.get(t)?.coords[up] ?? -Infinity
    if (v > bestV) { bestV = v; best = t }
  }
  return best
}

export const PLOT_PRESETS: PlotPreset[] = [
  {
    id: 'disp-vs-step', label: 'Node displacement', hint: 'Selected nodes, dx vs step',
    build: (ctx) => {
      const tags = nodesFor(ctx)
      if (!tags.length) return null
      const c = pick(ctx.targets.disp.components, 'dx')
      return { x: { type: 'step' }, series: tags.map((t) => ({ y: response('disp', c, 'single', [t]) })) }
    },
  },
  {
    id: 'base-shear-vs-step', label: 'Base shear', hint: 'Σ reactions vs step',
    build: (ctx) => {
      if (!ctx.targets.reaction.tags.length) return null
      return { x: { type: 'step' }, series: [{ y: response('reaction', pick(ctx.targets.reaction.components, 'Fx'), 'sum', ctx.targets.reaction.tags, -1) }] }
    },
  },
  {
    id: 'pushover', label: 'Pushover', hint: 'Base shear vs control node dx',
    build: (ctx) => {
      const control = ctx.selectedNodeIds.find((t) => ctx.targets.disp.tags.includes(t)) ?? roofNode(ctx)
      if (control === null || !ctx.targets.reaction.tags.length) return null
      return {
        x: response('disp', pick(ctx.targets.disp.components, 'dx'), 'single', [control]),
        series: [{ y: response('reaction', pick(ctx.targets.reaction.components, 'Fx'), 'sum', ctx.targets.reaction.tags, -1) }],
      }
    },
  },
  {
    id: 'moment-vs-rotation', label: 'Moment–rotation hysteresis', hint: 'End moment vs end rotation',
    build: (ctx) => {
      const ele = ctx.targets.force.tags[0]
      const nodes = ele === undefined ? undefined : ctx.model.elements.get(ele)?.nodes
      if (!nodes || !ctx.targets.disp.components.includes('rz')) return null
      // Use the end whose rotation is free: a fixed end (e.g. a zero-length section's base node) never rotates.
      const rzFixed = (t: number) => ctx.model.fixes.get(t)?.dofs.includes(3) ?? false
      const end = [0, 1].find((k) => nodes[k] !== undefined && ctx.targets.disp.tags.includes(nodes[k]) && !rzFixed(nodes[k])) ?? 0
      const comp = end === 0 ? 'Mi' : 'Mj'
      if (nodes[end] === undefined || !ctx.targets.disp.tags.includes(nodes[end]) || !ctx.targets.force.components.includes(comp)) return null
      return { x: response('disp', 'rz', 'single', [nodes[end]]), series: [{ y: response('force', comp, 'single', [ele]) }] }
    },
  },
]

/** One displacement series per selected node (for the component named `component`, default dx). */
export function selectedNodeSeries(ctx: PresetContext, component = 'dx'): { y: Channel }[] {
  const have = new Set(ctx.targets.disp.tags)
  const c = pick(ctx.targets.disp.components, component)
  return ctx.selectedNodeIds.filter((t) => have.has(t)).map((t) => ({ y: response('disp', c, 'single', [t]) }))
}
