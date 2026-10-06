import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/app/store/useAppStore'
import { useResultsSource } from './useResultsSource'
import { useModalResults } from './useModalResults'
import type { CaseInfo } from './stepFrames'

/** The run's cases in stage order: every stage with steps, plus every modal stage (a modal case has `first` -1 and `count` 0). Null while loading. */
export function useCases(runId: string | null): CaseInfo[] | null {
  const source = useResultsSource(runId)
  const modal = useModalResults(runId)
  const [loaded, setLoaded] = useState<{ source: NonNullable<typeof source>; cases: CaseInfo[] } | null>(null)
  useEffect(() => {
    if (!source) return
    let live = true
    source.cases().then((cases) => { if (live) setLoaded({ source, cases }) }).catch(() => { if (live) setLoaded({ source, cases: [] }) })
    return () => { live = false }
  }, [source])
  return useMemo(() => {
    if (!source || !modal || loaded?.source !== source) return null
    const modalCases: CaseInfo[] = modal.stages.map((m) => ({ stageIndex: m.stageIndex, stageId: m.stageId, kind: 'modal', first: -1, count: 0 }))
    return [...loaded.cases, ...modalCases].sort((a, b) => a.stageIndex - b.stageIndex)
  }, [source, modal, loaded])
}

export interface CurrentCase {
  cases: CaseInfo[] | null
  /** The selected case (`resultsView.caseStage`), else the one holding the current step, else the last with steps, else the first. */
  current: CaseInfo | null
  /** The case whose steps time-history views (plot, step slider) use: `current`, or the last case with steps when `current` is modal. */
  series: CaseInfo | null
}

export function useCurrentCase(): CurrentCase {
  const runId = useAppStore((s) => s.resultsView.runId)
  const caseStage = useAppStore((s) => s.resultsView.caseStage)
  const step = useAppStore((s) => s.resultsView.step)
  const cases = useCases(runId)
  return useMemo(() => {
    if (!cases?.length) return { cases, current: null, series: null }
    const withSteps = cases.filter((c) => c.count > 0)
    const current = cases.find((c) => c.stageIndex === caseStage)
      ?? withSteps.find((c) => step >= c.first && step < c.first + c.count)
      ?? withSteps[withSteps.length - 1] ?? cases[0]
    return { cases, current, series: current.count > 0 ? current : withSteps[withSteps.length - 1] ?? null }
  }, [cases, caseStage, step])
}
