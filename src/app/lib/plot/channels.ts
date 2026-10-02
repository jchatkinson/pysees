import type { RunLayout, StepFrameSource } from '@/app/lib/resultsStorage/stepFrames'
import type { Channel, ResponseKind } from '@/app/types/plotView'

export interface KindTargets {
  /** Node tags (disp, reaction) or element tags (force) that have recorded data. */
  tags: number[]
  /** Component labels, e.g. dx/dy/rz or Ni/Vi/Mi/Nj/Vj/Mj. */
  components: string[]
}
export type AvailableTargets = Record<ResponseKind, KindTargets>

export const KIND_LABELS: Record<ResponseKind, string> = { disp: 'Node displacement', reaction: 'Reaction', force: 'Element force' }
export const TARGET_LABELS: Record<ResponseKind, string> = { disp: 'Node', reaction: 'Node', force: 'Element' }

export function availableTargets(layout: RunLayout | null): AvailableTargets {
  const out: AvailableTargets = { disp: { tags: [], components: [] }, reaction: { tags: [], components: [] }, force: { tags: [], components: [] } }
  if (!layout) return out
  for (const kind of ['disp', 'reaction', 'force'] as const) {
    out[kind].tags = [...layout.columns[kind].keys()].sort((a, b) => a - b)
    out[kind].components = [...(layout.columns[kind].values().next().value?.labels ?? [])]
  }
  return out
}

/** Row indices and coefficients to combine for a response channel, or null if any tag/component has no recorded data. */
export function channelTerms(ch: Channel, layout: RunLayout): { column: number; coef: number }[] | null {
  if (ch.type !== 'response') return []
  if (!ch.tags.length || (ch.mode === 'difference' && ch.tags.length !== 2)) return null
  const terms: { column: number; coef: number }[] = []
  for (let i = 0; i < ch.tags.length; i++) {
    const entry = layout.columns[ch.kind].get(ch.tags[i])
    const c = entry?.labels.indexOf(ch.component) ?? -1
    if (!entry || c < 0) return null
    terms.push({ column: entry.offset + c, coef: (ch.mode === 'difference' && i === 1 ? -1 : 1) * ch.scale })
  }
  return terms
}

const SHORT_KIND: Record<ResponseKind, string> = { disp: 'N', reaction: 'N', force: 'E' }

export function describeChannel(ch: Channel): string {
  if (ch.type === 'step') return 'Step'
  if (ch.type === 'time') return 'Pseudo-time'
  const tag = (t: number) => `${SHORT_KIND[ch.kind]}${t}`
  const base = ch.mode === 'single' ? `${ch.component} ${tag(ch.tags[0] ?? 0)}`
    : ch.mode === 'sum' ? `Σ ${ch.component} (${ch.tags.length > 4 ? `${ch.tags.length} ${ch.kind === 'force' ? 'elements' : 'nodes'}` : ch.tags.map(tag).join(',')})`
    : `${ch.component} ${tag(ch.tags[0] ?? 0)} − ${tag(ch.tags[1] ?? 0)}`
  return ch.scale === 1 ? base : ch.scale === -1 ? `−${base}` : `${Number(ch.scale.toPrecision(3))}×${ch.mode === 'single' ? base : `(${base})`}`
}

export function seriesLabel(label: string, x: Channel, y: Channel): string {
  return label.trim() || (x.type === 'step' ? describeChannel(y) : `${describeChannel(y)} vs ${describeChannel(x)}`)
}

/** Values of a channel at every step, or null when the run has no data for it. */
export async function evaluateChannel(ch: Channel, source: StepFrameSource): Promise<Float64Array | null> {
  const n = source.sampleCount
  if (ch.type === 'step') return Float64Array.from({ length: n }, (_, i) => i)
  if (ch.type === 'time') return (await source.timeline()).pseudoTime
  const terms = channelTerms(ch, source.layout)
  if (!terms) return null
  const columns = await source.columns(terms.map((t) => t.column))
  const out = new Float64Array(n)
  columns.forEach((col, k) => { const coef = terms[k].coef; for (let i = 0; i < n; i++) out[i] += coef * col[i] })
  return out
}

/** Stable key for what a channel evaluates to, so unrelated series edits don't re-fetch. */
export const channelKey = (ch: Channel): string => JSON.stringify(ch)
