import * as React from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/lib/utils'

export type ChartConfig = {
  [k: string]: { label?: React.ReactNode; color?: string }
}

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

export function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error('useChart must be used within a <ChartContainer />')
  return context
}

export function ChartContainer({ id, className, children, config, ...props }: React.ComponentProps<'div'> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'] }) {
  const uid = React.useId()
  const chartId = `chart-${id || uid.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div data-slot="chart" data-chart={chartId} className={cn('flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/40 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke="#fff"]]:stroke-transparent', className)} {...props}>
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, cfg]) => cfg.color)
  if (!colorConfig.length) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {${colorConfig.map(([key, cfg]) => `--color-${key}: ${cfg.color};`).join('')}}`,
      }}
    />
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

export function ChartTooltipContent({ active, payload }: RechartsPrimitive.TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border bg-background px-2 py-1 text-[10px] shadow-sm">
      {payload.map((item, idx) => (
        <div key={`${item.name}-${idx}`} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: item.color }} />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium text-foreground">{typeof item.value === 'number' ? item.value.toExponential(3) : String(item.value)}</span>
        </div>
      ))}
    </div>
  )
}
