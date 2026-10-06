import { useEffect, useState } from 'react'
import type { RunTimeline, StepFrameSource } from '@/app/lib/resultsStorage/stepFrames'
import type { Channel, SeriesSpec } from '@/app/types/plotView'
import { channelKey, evaluateChannel, type SampleRange } from './channels'

export interface SeriesValues {
  /** Null when the run has no recorded data for the channel. */
  x: Float64Array | null
  y: Float64Array | null
}

export interface PlotData {
  values: Map<string, SeriesValues>
  timeline: RunTimeline | null
  loading: boolean
}

const EMPTY: PlotData = { values: new Map(), timeline: null, loading: false }

/**
 * Evaluates every series' X and Y channels against the run. Re-runs only when a series' channels (or
 * the run) change — colour, label and visibility edits don't re-evaluate.
 */
export function usePlotData(source: StepFrameSource | null, series: SeriesSpec[], sharedX: boolean, sharedXChannel: Channel, range: SampleRange | null): PlotData {
  const signature = `${range?.first}:${range?.count};` + series.map((s) => `${s.id}|${channelKey(sharedX ? sharedXChannel : s.x)}|${channelKey(s.y)}`).join(';')
  const [state, setState] = useState<{ source: StepFrameSource; signature: string; data: PlotData } | null>(null)

  useEffect(() => {
    if (!source) return
    let live = true
    const xs = new Map<string, Promise<Float64Array | null>>()
    const evalX = (ch: Channel) => { const k = channelKey(ch); if (!xs.has(k)) xs.set(k, evaluateChannel(ch, source, range)); return xs.get(k)! }
    Promise.all([
      source.timeline(),
      ...series.map(async (s) => [s.id, { x: await evalX(sharedX ? sharedXChannel : s.x), y: await evaluateChannel(s.y, source, range) }] as const),
    ]).then(([whole, ...entries]) => {
      // The case's own slice of the run's timeline (the whole run's when no case is selected).
      const timeline = range ? { pseudoTime: whole.pseudoTime.slice(range.first, range.first + range.count), stage: whole.stage.slice(range.first, range.first + range.count) } : whole
      if (live) setState({ source, signature, data: { values: new Map(entries), timeline, loading: false } })
    }).catch(() => { if (live) setState({ source, signature, data: EMPTY }) })
    return () => { live = false }
    // `signature` captures everything about `series`/`sharedX`/`sharedXChannel` that affects evaluation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, signature])

  if (!source) return EMPTY
  return state && state.source === source && state.signature === signature ? state.data : { ...EMPTY, loading: true }
}
