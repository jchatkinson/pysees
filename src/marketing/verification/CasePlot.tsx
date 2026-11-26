import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlotResult } from '@/app/lib/verification/types'

const CARAPACE = '#0284c7', OPENSEES = '#0f172a', ANALYTICAL = '#d97706'
const fmt = (v: number) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(1) : Number(v.toPrecision(3)).toString())
const pts = (p: [number, number][]) => p.map(([x, y]) => ({ x, y }))

/** Carapace as a line, OpenSees as hollow markers on every few of the same points, a closed-form reference dashed. */
export default function CasePlot({ plot }: { plot: PlotResult }) {
  const every = Math.max(1, Math.round(plot.opensees.length / 45))
  const markers = plot.opensees.filter((_p, i) => i % every === 0 || i === plot.opensees.length - 1)
  return (
    <figure className="rounded-lg border border-slate-200 p-4">
      <figcaption className="mb-2 text-sm font-semibold text-slate-900">{plot.title}</figcaption>
      <div className={plot.kind === 'hysteresis' ? 'mx-auto aspect-square max-w-lg' : 'aspect-[16/10]'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 12, bottom: 28, left: 12 }}>
            <CartesianGrid stroke="#e2e8f0" />
            <XAxis type="number" dataKey="x" domain={['auto', 'auto']} tickFormatter={fmt} fontSize={11} stroke="#64748b" label={{ value: plot.xLabel, position: 'bottom', offset: 10, fontSize: 12, fill: '#334155' }} />
            <YAxis type="number" dataKey="y" domain={['auto', 'auto']} tickFormatter={fmt} fontSize={11} stroke="#64748b" width={64} label={{ value: plot.yLabel, angle: -90, position: 'insideLeft', offset: 0, fontSize: 12, fill: '#334155', style: { textAnchor: 'middle' } }} />
            <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(v) => fmt(Number(v))} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
            <Line data={pts(plot.carapace)} dataKey="y" name="Carapace" stroke={CARAPACE} strokeWidth={2} dot={plot.carapace.length < 12 ? { r: 3 } : false} isAnimationActive={false} />
            <Scatter data={pts(markers)} dataKey="y" name="OpenSees" shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={4} fill="none" stroke={OPENSEES} strokeWidth={1.3} />} isAnimationActive={false} />
            {plot.analytical && <Line data={pts(plot.analytical.points)} dataKey="y" name={plot.analytical.label} stroke={ANALYTICAL} strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} type="monotone" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
