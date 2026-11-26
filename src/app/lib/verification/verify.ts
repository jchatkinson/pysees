/// <reference types="node" />
import { exportScript } from '@/app/lib/exportScript'
import { runCarapace, runCarapaceModal, type CarapaceRun } from '@/app/lib/commands/carapaceRunner'
import { compareRuns, openseesColumn, openseesTables, type ColumnAdjust, type OpenSeesTables, type Quantity } from '@/app/lib/commands/comparison'
import { eleLoadKind, shellNodalAreas } from '@/app/lib/shells'
import type { Model } from '@/app/types/model'
import { runOpenSees } from '@/app/lib/commands/opensesRunner'
import { RTOL, type CaseResult, type ModalResult, type PlotResult, type PlotSpec, type QuantityMetric, type Signal, type VerificationCase } from './types'

const QUANTITIES: Quantity[] = ['disp', 'vel', 'accel', 'reaction', 'force', 'shell']
const MAX_POINTS = 300

/** Reads one signal from both engines, step by step. */
export function readSignal(run: CarapaceRun, t: OpenSeesTables, s: Signal): { carapace: number[]; opensees: number[] } {
  if ('sum' in s) {
    const parts = s.sum.map((p) => readSignal(run, t, p))
    const add = (k: 'carapace' | 'opensees') => run.times.map((_v, i) => (s.scale ?? 1) * parts.reduce((a, p) => a + (p[k][i] ?? NaN), 0))
    return { carapace: add('carapace'), opensees: add('opensees') }
  }
  if (s.q === 'time') return { carapace: run.times, opensees: t.node.disp.map((r) => r[0]) }
  if (s.q === 'step') return { carapace: run.times.map((_v, i) => i + 1), opensees: run.times.map((_v, i) => i + 1) }
  const node = 'node' in s
  const plan = run.compile.recorderPlans.find((p) => p.kind === s.q && p.targetTag === (node ? s.node : s.ele))
  if (!plan) throw new Error(`No ${s.q} recorded for ${node ? 'node' : 'element'} ${node ? s.node : s.ele}`)
  const j = node ? s.dof - 1 : s.component
  const opensees = openseesColumn(t, plan, j)
  if (!opensees) throw new Error(`OpenSees recorded no ${s.q} component ${j} for ${plan.targetTag}`)
  return { carapace: run.columns[plan.columnOffset + j], opensees }
}

/** Largest-triangle-three-buckets: keeps a curve's shape (peaks, reversals) in at most `n` points. */
export function downsample(points: [number, number][], n = MAX_POINTS): [number, number][] {
  if (points.length <= n) return points
  const out: [number, number][] = [points[0]]
  const size = (points.length - 2) / (n - 2)
  let a = 0
  for (let i = 0; i < n - 2; i++) {
    const start = Math.floor(i * size) + 1, end = Math.floor((i + 1) * size) + 1
    const nextEnd = Math.min(Math.floor((i + 2) * size) + 1, points.length)
    let ax = 0, ay = 0
    for (let k = end; k < nextEnd; k++) { ax += points[k][0]; ay += points[k][1] }
    const cnt = Math.max(1, nextEnd - end); ax /= cnt; ay /= cnt
    let best = start, area = -1
    for (let k = start; k < end; k++) {
      const s = Math.abs((points[a][0] - ax) * (points[k][1] - points[a][1]) - (points[a][0] - points[k][0]) * (ay - points[a][1]))
      if (s > area) { area = s; best = k }
    }
    out.push(points[best]); a = best
  }
  out.push(points[points.length - 1])
  return out
}

const sig = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : 0)
const round = (p: [number, number][]): [number, number][] => p.map(([x, y]) => [sig(x), sig(y)])

function plotResult(run: CarapaceRun, t: OpenSeesTables, p: PlotSpec): PlotResult {
  const x = readSignal(run, t, p.x), y = readSignal(run, t, p.y)
  const rows = run.times.map((_v, i) => i).filter((i) => !p.stages || p.stages.includes(run.stageOfStep[i]))
  const series = (k: 'carapace' | 'opensees') => {
    const pts = rows.map((i): [number, number] => [x[k][i], y[k][i]])
    return round(downsample(p.origin ? [[0, 0], ...pts] : pts))
  }
  return { title: p.title, xLabel: p.xLabel, yLabel: p.yLabel, kind: p.kind ?? 'line', carapace: series('carapace'), opensees: series('opensees') }
}

/** Frequencies (rad/s) and mode shapes from the exported script, printed after its `eigen`. */
function openseesModes(script: string, nodes: number[], modes: number) {
  const prints = [`print('@@EIG', *ops.eigen(${modes}))`, `for _m in range(1, ${modes + 1}):`, `    for _n in [${nodes.join(', ')}]:`, `        print('@@VEC', _m, _n, *ops.nodeEigenvector(_n, _m))`].join('\n')
  // OpenSees drops its eigen solver after one call, so the vectors are read right after it.
  const r = runOpenSees(script.replace(/ops\.eigen\((\d+)\)/, prints))
  const lines = r.stdout.split('\n')
  const eig = lines.find((l) => l.startsWith('@@EIG'))
  const frequencies = eig ? eig.split(/\s+/).slice(1).map((v) => Math.sqrt(Number(v))) : []
  const shapes: number[][] = Array.from({ length: modes }, () => [])
  for (const l of lines.filter((l) => l.startsWith('@@VEC'))) {
    const [, m, , ...v] = l.split(/\s+/)
    shapes[Number(m) - 1].push(...v.map(Number))
  }
  return { ...r, frequencies, shapes }
}

/** Each mode normalised by its largest Carapace component (sign included), the same index for OpenSees. */
function shapeDifference(mine: number[], theirs: number[]): number {
  let k = 0
  for (let i = 0; i < mine.length; i++) if (Math.abs(mine[i]) > Math.abs(mine[k])) k = i
  if (!mine[k] || !theirs[k]) return Infinity
  return Math.max(...mine.map((v, i) => Math.abs(v / mine[k] - theirs[i] / theirs[k])))
}

/**
 * OpenSees has no shell pressure (and a ShellDKGT self-weight it would double), so the export turns those into nodal loads and OpenSees' element
 * forces leave them out; Carapace's include them. Adding each element's share back (load factor × load per area × tributary area, the
 * integral the export uses) makes them comparable. Every
 * pattern is taken to ramp with the recorded time, as in a single load-controlled stage.
 */
export function shellPressureAdjust(model: Model): ColumnAdjust | undefined {
  const perElement = new Map<number, number[]>()
  for (const pattern of model.patterns.values()) for (const child of pattern.children) {
    const kind = child.kind === 'eleLoad' ? eleLoadKind(child.args) : null
    if (kind !== 'pressure' && kind !== 'selfWeight') continue
    const a = child.args as { eleTags: number[]; pressure?: number; bx?: number; by?: number; bz?: number }
    for (const tag of a.eleTags) {
      const ele = model.elements.get(tag)
      // A ShellDKGT's self-weight is exported as nodal loads too (OpenSees' own doubles it); a quad's stays an element load.
      if (!ele || (kind === 'selfWeight' && ele.eleType !== 'ShellDKGT')) continue
      const g = shellNodalAreas(ele.nodes.map((n) => model.nodes.get(n)!.coords as [number, number, number]))
      if (!g) continue
      const section = model.sections.get(Number(ele.args.secTag))
      const rhoH = (Number(section?.args.rho) || 0) * (Number(section?.args.h) || 0)
      const perArea = kind === 'pressure' ? g.normal.map((n) => n * (Number(a.pressure) || 0)) : [a.bx, a.by, a.bz].map((b) => (Number(b) || 0) * rhoH)
      const v = perElement.get(tag) ?? new Array(ele.nodes.length * 6).fill(0)
      g.areas.forEach((area, i) => { for (let d = 0; d < 3; d++) v[i * 6 + d] += Number(pattern.args.fact ?? 1) * perArea[d] * area })
      perElement.set(tag, v)
    }
  }
  if (!perElement.size) return undefined
  return (plan, j, column, t) => {
    const v = plan.kind === 'force' ? perElement.get(plan.targetTag) : undefined
    if (!v) return column
    const time = t.node.disp.map((r) => r[0])
    return column.map((x, i) => x - time[i] * v[j])
  }
}

export interface CaseRun { result: CaseResult; script: string; opensees: { stdout: string; stderr: string; failures: string[] } }

/** Runs a case in Carapace and in real OpenSees (from the script PySees exports) and measures how far apart they are. */
export function verifyCase(c: VerificationCase): CaseRun {
  const built = c.build()
  const { model, history } = built
  const plotSpecs = typeof c.plots === 'function' ? c.plots(built) : c.plots
  const script = exportScript(model, history, 'py')
  const rtol: { value: number; why?: string; quantities?: Quantity[] } = c.rtol ?? { value: RTOL }
  const skip = c.skip ?? []
  const problems: string[] = []
  const base = { id: c.id, category: c.category, skip, rtol, sources: c.sources, shot: c.shot, ndm: model.config!.ndm, elements: model.elements.size, nodes: model.nodes.size }

  if (c.modes) {
    const carapace = runCarapaceModal(model, history)
    if (carapace.error) problems.push(`Carapace: ${typeof carapace.error === "object" ? JSON.stringify(carapace.error) : String(carapace.error)}`)
    const nodes = carapace.compile.nodeTags
    const ops = openseesModes(script, nodes, c.modes)
    if (ops.failures.length) problems.push(`OpenSees: ${ops.failures.join('; ')}`)
    const modes = carapace.stages[0]?.modes ?? []
    const freqs = modes.map((m) => m.frequency)
    const frequencyMaxRel = Math.max(...freqs.map((f, i) => Math.abs(f - ops.frequencies[i]) / ops.frequencies[i]))
    const shapeMaxAbs = Math.max(...modes.map((m, i) => shapeDifference([...m.shape], ops.shapes[i] ?? [])))
    const modal: ModalResult = { carapace: freqs.map(sig), opensees: ops.frequencies.map(sig), frequencyMaxRel, shapeMaxAbs }
    if (freqs.length !== c.modes || ops.frequencies.length !== c.modes) problems.push(`expected ${c.modes} modes, got ${freqs.length} (Carapace) and ${ops.frequencies.length} (OpenSees)`)
    if (!(frequencyMaxRel < rtol.value)) problems.push(`frequencies differ by ${frequencyMaxRel.toExponential(2)}`)
    if (!(shapeMaxAbs < rtol.value)) problems.push(`mode shapes differ by ${shapeMaxAbs.toExponential(2)}`)
    const worst = Math.max(frequencyMaxRel, shapeMaxAbs)
    const plot: PlotResult = { title: 'Natural frequencies', xLabel: 'Mode', yLabel: 'ω (rad/s)', kind: 'line', carapace: freqs.map((f, i) => [i + 1, sig(f)]), opensees: ops.frequencies.map((f, i) => [i + 1, sig(f)]) }
    return { script, opensees: ops, result: { ...base, steps: { carapace: 0, opensees: 0 }, metrics: {}, modal, worst, pass: problems.length === 0, problems, plots: [plot] } }
  }

  const carapace = runCarapace(model, history)
  if (carapace.error) problems.push(`Carapace: ${typeof carapace.error === "object" ? JSON.stringify(carapace.error) : String(carapace.error)}`)
  const errors = carapace.compile.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length) problems.push(`compile: ${errors.map((d) => d.message).join('; ')}`)
  const ops = runOpenSees(script)
  if (ops.failures.length) problems.push(`OpenSees: ${ops.failures.join('; ')}`)
  const cmp = compareRuns(model, carapace, ops.files, shellPressureAdjust(model))
  if (cmp.steps.opensees !== cmp.steps.carapace) problems.push(`OpenSees ran ${cmp.steps.opensees} steps, Carapace ${cmp.steps.carapace}`)
  const metrics: Partial<Record<Quantity, QuantityMetric>> = {}
  const hasShells = [...model.elements.values()].some((e) => e.eleType.startsWith('Shell'))
  const required: Quantity[] = ['disp', 'reaction', 'force', ...(hasShells ? ['shell' as const] : [])]
  let worst = 0
  for (const q of QUANTITIES) {
    if (skip.some((s) => s.quantity === q)) continue
    if (cmp.compared[q] > 0) {
      metrics[q] = { compared: cmp.compared[q], scale: sig(cmp.scale[q]), maxAbs: sig(cmp.maxAbs[q]), maxRel: sig(cmp.maxRel[q]) }
      worst = Math.max(worst, cmp.maxRel[q])
      const limit = !rtol.quantities || rtol.quantities.includes(q) ? rtol.value : RTOL
      if (!(cmp.maxRel[q] < limit)) problems.push(`${q} differs by ${cmp.maxRel[q].toExponential(2)} (max |diff| ${cmp.maxAbs[q].toExponential(2)} against ${cmp.scale[q].toExponential(2)})`)
    } else if (required.includes(q)) problems.push(`${q}: nothing was compared`)
  }
  const t = openseesTables(model, ops.files)
  const plots: PlotResult[] = []
  plotSpecs.forEach((p, i) => {
    try {
      const r = plotResult(carapace, t, p)
      const a = c.analytical?.find((a) => a.plot === i)
      if (a) r.analytical = { label: a.label, points: round(a.points()) }
      plots.push(r)
    } catch (e) { problems.push(`plot "${p.title}": ${(e as Error).message}`) }
  })
  return { script, opensees: ops, result: { ...base, steps: cmp.steps, metrics, worst, pass: problems.length === 0, problems, plots } }
}
