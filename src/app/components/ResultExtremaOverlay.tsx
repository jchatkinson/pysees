import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/app/store/useAppStore'
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { useCurrentCase } from '@/app/lib/resultsStorage/useCases'
import { caseResultExtrema, type ResultExtrema, type ResultExtreme } from '@/app/lib/resultsExtrema'
import { buildSceneIndex } from './r3f/sceneIndex'
import { SHELL_RESULTANT_LABELS } from '@/app/lib/shellContour'
import type { ResultType } from '@/app/types/resultsView'

const labels: Partial<Record<ResultType, string>> = { deformed: 'Displacement |u|', axial: 'Axial force (N)', shear: 'Shear force (Vy)', shearZ: 'Shear force (Vz)', torsion: 'Torsion (T)', moment: 'Bending moment (Mz)', momentY: 'Bending moment (My)' }
const fmt = (v: number) => v === 0 ? '0' : Number(v.toPrecision(5)).toString()

export function ResultExtremaOverlay() {
  const runId = useAppStore((s) => s.resultsView.runId)
  const type = useAppStore((s) => s.resultsView.type)
  const contour = useAppStore((s) => s.resultsView.contour)
  const model = useAppStore((s) => s.model)
  const source = useResultsSource(runId)
  const { current } = useCurrentCase()
  const first = current?.first ?? 0, count = current?.count ?? 0
  const index = useMemo(() => buildSceneIndex(model.nodes, model.elements, model.geomTransfs, model.config?.ndm ?? 2), [model])
  const cache = useMemo(() => ({ source, index, values: new Map<string, ResultExtrema | null>() }), [source, index])
  const key = `${runId}:${first}:${count}:${type}:${contour}`
  const [loaded, setLoaded] = useState<{ cache: typeof cache; key: string; extrema: ResultExtrema | null; error?: boolean } | null>(null)
  const visible = !!source && count > 0 && current?.kind !== 'modal' && type !== 'none' && type !== 'mode'
  useEffect(() => {
    if (!visible || !source) return
    const controller = new AbortController()
    const calculation = cache.values.has(key) ? Promise.resolve(cache.values.get(key) ?? null) : caseResultExtrema(source, index, first, count, type, contour, controller.signal)
    calculation.then((extrema) => {
      if (!controller.signal.aborted) { cache.values.set(key, extrema); setLoaded({ cache, key, extrema }) }
    }).catch(() => { if (!controller.signal.aborted) setLoaded({ cache, key, extrema: null, error: true }) })
    return () => controller.abort()
  }, [source, index, first, count, type, contour, visible, key, cache])
  if (!visible) return null
  const result = loaded?.cache === cache && loaded.key === key ? loaded : null
  const title = type === 'contour' ? SHELL_RESULTANT_LABELS[contour] : model.config?.ndm === 2 && type === 'shear' ? 'Shear force (V)' : model.config?.ndm === 2 && type === 'moment' ? 'Bending moment (M)' : labels[type]
  const detail = (r: ResultExtreme) => <><span className="font-medium tabular-nums">{fmt(r.value)}</span> · {r.target} #{r.id} · step {r.step - first} · t = {fmt(r.time)}</>
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/85 px-3 py-1.5 text-xs shadow">
      <div className="font-medium">{title} · case extrema</div>
      {result?.extrema ? <div className="grid gap-0.5"><div>Max {detail(result.extrema.max)}</div><div>Min {detail(result.extrema.min)}</div></div>
        : <div className="text-muted-foreground">{!result ? 'Calculating…' : result.error ? 'Unable to load extrema.' : 'No recorded values.'}</div>}
    </div>
  )
}
