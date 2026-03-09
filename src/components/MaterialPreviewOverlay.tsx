import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { X, Play, Square, Eraser, ChevronDown, ChevronUp } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useAppStore } from '@/store/useAppStore'
import type { CyclicStrainIncrement, ProtocolType } from '@/lib/materialPreviewProtocol'
import { generateLoadingProtocol } from '@/lib/materialPreviewProtocol'

const hysteresisChartConfig = {
  sig: { label: 'Stress', color: '#0ea5e9' },
} as const

const protocolChartConfig = { eps: { label: 'Strain', color: '#22c55e' } } as const
const HYSTERESIS_ANIMATION_MS = 3000

const HysteresisChartPanel = memo(function HysteresisChartPanel({
  connected,
  animateToken,
  scrubCount,
}: {
  connected: boolean
  animateToken: number
  scrubCount: number | null
}) {
  const points = useAppStore((s) => s.materialPreview.points)
  const [displayCount, setDisplayCount] = useState(0)
  const displayCountRef = useRef(0)

  useEffect(() => {
    displayCountRef.current = displayCount
  }, [displayCount])

  useEffect(() => {
    setDisplayCount(0)
    displayCountRef.current = 0
  }, [animateToken])

  useEffect(() => {
    if (scrubCount === null) return
    setDisplayCount(Math.max(0, Math.min(points.length, scrubCount)))
  }, [points.length, scrubCount])

  useEffect(() => {
    if (displayCount > points.length) setDisplayCount(points.length)
  }, [displayCount, points.length])

  useEffect(() => {
    if (scrubCount !== null || displayCountRef.current >= points.length) return
    const startCount = displayCountRef.current
    const endCount = points.length
    const distance = endCount - startCount
    const durationMs = Math.max(100, Math.round((distance / Math.max(endCount, 1)) * HYSTERESIS_ANIMATION_MS))
    let raf = 0
    let startTs: number | null = null
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts
      const progress = Math.min(1, (ts - startTs) / durationMs)
      const next = Math.round(startCount + distance * progress)
      if (next !== displayCountRef.current) {
        displayCountRef.current = next
        setDisplayCount(next)
      }
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animateToken, points.length, scrubCount])

  const animatedPoints = useMemo(() => points.slice(0, displayCount), [displayCount, points])

  return (
    <div className="rounded border p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium">Chart</p>
        <p className="text-[10px] text-muted-foreground">{animatedPoints.length}/{points.length} points</p>
      </div>
      {connected ? (
        <ChartContainer config={hysteresisChartConfig} className="h-72 w-full">
          <LineChart data={animatedPoints} margin={{ left: 2, right: 6, top: 6, bottom: 2 }}>
            <CartesianGrid />
            <XAxis
              type="number"
              dataKey="eps"
              domain={['auto', 'auto']}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
              tick={{ fontSize: 9 }}
            />
            <YAxis
              type="number"
              domain={['auto', 'auto']}
              tickLine={false}
              axisLine={false}
              width={28}
              tick={{ fontSize: 9 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="linear" dataKey="sig" stroke={hysteresisChartConfig.sig.color} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ChartContainer>
      ) : (
        <div className="grid h-72 place-items-center rounded border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Not Connected - Setup connection to local opensees instance to enable material previews
        </div>
      )}
    </div>
  )
})

export function MaterialPreviewOverlay() {
  const localAgentStatus = useAppStore((s) => s.localAgent.status)
  const localAgentPort = useAppStore((s) => s.localAgent.port)
  const localAgentError = useAppStore((s) => s.localAgent.error)
  const panelOpen = useAppStore((s) => s.materialPreview.panelOpen)
  const previewProtocol = useAppStore((s) => s.materialPreview.protocol)
  const previewError = useAppStore((s) => s.materialPreview.error)
  const previewLogs = useAppStore((s) => s.materialPreview.logs)
  const previewRunning = useAppStore((s) => s.materialPreview.running)
  const previewInputCommand = useAppStore((s) => s.materialPreview.inputCommand)
  const previewPointCount = useAppStore((s) => s.materialPreview.points.length)
  const runMaterialPreview = useAppStore((s) => s.runMaterialPreview)
  const cancelMaterialPreview = useAppStore((s) => s.cancelMaterialPreview)
  const setPanelOpen = useAppStore((s) => s.setMaterialPreviewPanelOpen)
  const clearMaterialPreviewResult = useAppStore((s) => s.clearMaterialPreviewResult)
  const clearLogs = useAppStore((s) => s.clearMaterialPreviewLogs)

  const [showLogs, setShowLogs] = useState(false)
  const [protocolType, setProtocolType] = useState<ProtocolType>('custom')
  const [maxStrain, setMaxStrain] = useState('0.02')
  const [numCycles, setNumCycles] = useState('3')
  const [strainIncrement, setStrainIncrement] = useState<CyclicStrainIncrement>('evenly_per_cycle')
  const [approxSteps, setApproxSteps] = useState('200')
  const [protocolText, setProtocolText] = useState(previewProtocol.join(', '))
  const [animateToken, setAnimateToken] = useState(0)
  const [scrubCount, setScrubCount] = useState<number | null>(null)

  useEffect(() => {
    setProtocolText(previewProtocol.join(', '))
  }, [previewProtocol])

  const generatedProtocol = useMemo(() => generateLoadingProtocol({
    type: protocolType,
    maxStrain: Number(maxStrain),
    approxSteps: Number(approxSteps),
    numberOfCycles: Number(numCycles),
    strainIncrement,
    customText: protocolText,
  }), [approxSteps, maxStrain, numCycles, protocolText, protocolType, strainIncrement])
  const protocolChartData = useMemo(() => generatedProtocol.map((eps, i) => ({ i, eps })), [generatedProtocol])

  useEffect(() => {
    clearMaterialPreviewResult()
    setScrubCount(null)
  }, [clearMaterialPreviewResult, previewInputCommand, protocolType, maxStrain, numCycles, strainIncrement, approxSteps, protocolText])

  if (!panelOpen) return null

  return (
    <div className="absolute bottom-3 right-3 z-40 w-[560px] max-w-[calc(100%-1.5rem)]">
      <Card className="shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Material Preview</CardTitle>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {localAgentStatus === 'connected' ? `Connected :${localAgentPort}` : localAgentStatus}
            </span>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => setPanelOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(previewError || localAgentError) && (
            <p className="text-[11px] text-destructive">{previewError || localAgentError}</p>
          )}

          <Tabs defaultValue="protocol">
            <TabsList className="w-full">
              <TabsTrigger value="protocol">Load Protocol</TabsTrigger>
              <TabsTrigger value="hysteresis">Material Hysteresis</TabsTrigger>
            </TabsList>
            <TabsContent value="protocol" className="mt-2">
              <div className="grid gap-2 rounded border p-2">
                <div className="grid gap-1">
                  <Label>Protocol Type</Label>
                  <Select value={protocolType} onValueChange={(value) => setProtocolType(value as ProtocolType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monotonic">Monotonic</SelectItem>
                      <SelectItem value="cyclic">Cyclic</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {protocolType !== 'custom' && (
                  <div className="grid gap-2">
                    <div className="grid gap-1">
                      <Label>Max Strain</Label>
                      <Input value={maxStrain} type="number" step="0.001" onChange={(e) => setMaxStrain(e.target.value)} />
                    </div>
                    {protocolType === 'cyclic' && (
                      <>
                        <div className="grid gap-1">
                          <Label>Number of Cycles</Label>
                          <Input value={numCycles} type="number" min="1" step="1" onChange={(e) => setNumCycles(e.target.value)} />
                        </div>
                        <div className="grid gap-1">
                          <Label>Strain Increment</Label>
                          <Select value={strainIncrement} onValueChange={(value) => setStrainIncrement(value as CyclicStrainIncrement)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="evenly_per_cycle">Evenly per cycle</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    <div className="grid gap-1">
                      <Label>Approx Number of Steps</Label>
                      <Input value={approxSteps} type="number" min="10" step="1" onChange={(e) => setApproxSteps(e.target.value)} />
                    </div>
                  </div>
                )}

                {protocolType === 'custom' && (
                  <div className="grid gap-1">
                    <Label>Custom Strain List</Label>
                    <Textarea
                      value={protocolText}
                      onChange={(e) => setProtocolText(e.target.value)}
                      rows={3}
                      className="text-xs [field-sizing:fixed] h-24 max-h-24 overflow-y-scroll"
                      placeholder="0, 0.001, -0.001, 0.002, -0.002"
                    />
                  </div>
                )}

                <div className="py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium">Loading Protocol</p>
                    <p className="text-[10px] text-muted-foreground">{generatedProtocol.length} steps</p>
                  </div>
                  <ChartContainer config={protocolChartConfig} className="h-28 w-full">
                    <LineChart data={protocolChartData} margin={{ left: 2, right: 6, top: 6, bottom: 2 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="i" hide />
                      <YAxis tickLine={false} axisLine={false} width={28} tick={{ fontSize: 9 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="linear" dataKey="eps" stroke={protocolChartConfig.eps.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ChartContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="hysteresis" className="mt-2">
              <HysteresisChartPanel connected={localAgentStatus === 'connected'} animateToken={animateToken} scrubCount={scrubCount} />
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                runMaterialPreview(generatedProtocol)
              }}
              disabled={localAgentStatus !== 'connected' || !previewInputCommand || previewRunning}
            >
              <Play className="mr-1 size-3.5" />Run
            </Button>
            <Button size="sm" variant="outline" onClick={cancelMaterialPreview} disabled={!previewRunning}>
              <Square className="mr-1 size-3.5" />Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setScrubCount(null)
                setAnimateToken((v) => v + 1)
              }}
              disabled={localAgentStatus !== 'connected' || previewRunning || previewPointCount === 0}
            >
              Animate
            </Button>
            <div className="ml-auto flex min-w-0 flex-1 items-center gap-2">
              <p className="shrink-0 text-[10px] text-muted-foreground">{scrubCount ?? previewPointCount}/{previewPointCount}</p>
              <Slider
                value={[scrubCount ?? previewPointCount]}
                min={0}
                max={Math.max(1, previewPointCount)}
                step={1}
                className="w-full"
                onValueChange={(value) => setScrubCount(value[0] ?? 0)}
                disabled={previewPointCount === 0}
              />
            </div>
          </div>

          <div className="rounded border p-2">
            <div className="flex items-center gap-2">
              <button className="flex flex-1 items-center text-[11px] font-medium" onClick={() => setShowLogs((v) => !v)}>
                Runtime logs
                {showLogs ? <ChevronUp className="ml-auto size-3.5" /> : <ChevronDown className="ml-auto size-3.5" />}
              </button>
              <Button size="sm" variant="ghost" onClick={clearLogs} disabled={previewLogs.length === 0}>
                <Eraser className="mr-1 size-3.5" />Clear Logs
              </Button>
            </div>
            {showLogs && (
              <div className="mt-2 max-h-28 overflow-auto rounded border bg-muted/20 p-2 font-mono text-[10px]">
                {previewLogs.length === 0 ? (
                  <p className="text-muted-foreground">No logs.</p>
                ) : (
                  previewLogs.map((log, i) => <p key={`${log.stream}-${i}`}>[{log.stream}] {log.line}</p>)
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
