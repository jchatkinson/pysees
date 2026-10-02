import type { Model } from '@/app/types/model'
import type { Channel } from '@/app/types/plotView'
import type { AvailableTargets } from './channels'

export interface PlotPreset {
  id: string
  label: string
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
    id: 'disp-vs-step', label: 'Node displacement vs step',
    build: (ctx) => {
      const tags = nodesFor(ctx)
      if (!tags.length) return null
      const c = pick(ctx.targets.disp.components, 'dx')
      return { x: { type: 'step' }, series: tags.map((t) => ({ y: response('disp', c, 'single', [t]) })) }
    },
  },
  {
    id: 'base-shear-vs-step', label: 'Base shear (Σ reactions) vs step',
    build: (ctx) => {
      if (!ctx.targets.reaction.tags.length) return null
      return { x: { type: 'step' }, series: [{ y: response('reaction', pick(ctx.targets.reaction.components, 'Fx'), 'sum', ctx.targets.reaction.tags, -1) }] }
    },
  },
  {
    id: 'pushover', label: 'Pushover: base shear vs control node displacement',
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
    id: 'moment-vs-rotation', label: 'Hysteresis: element end moment vs end rotation',
    build: (ctx) => {
      const ele = ctx.targets.force.tags[0]
      const nodeI = ele === undefined ? undefined : ctx.model.elements.get(ele)?.nodes[0]
      if (nodeI === undefined || !ctx.targets.disp.tags.includes(nodeI) || !ctx.targets.disp.components.includes('rz') || !ctx.targets.force.components.includes('Mi')) return null
      return { x: response('disp', 'rz', 'single', [nodeI]), series: [{ y: response('force', 'Mi', 'single', [ele]) }] }
    },
  },
]

/** One displacement series per selected node (for the component named `component`, default dx). */
export function selectedNodeSeries(ctx: PresetContext, component = 'dx'): { y: Channel }[] {
  const have = new Set(ctx.targets.disp.tags)
  const c = pick(ctx.targets.disp.components, component)
  return ctx.selectedNodeIds.filter((t) => have.has(t)).map((t) => ({ y: response('disp', c, 'single', [t]) }))
}
