import { useEffect } from 'react'
import { useAppStore } from '@/app/store/useAppStore'

/**
 * Drives `resultsView.step` (and `stepFrac` for smooth playback) from a requestAnimationFrame loop
 * while `playing`, within one case's sample range `first`..`last` (inclusive). Speed, loop and smooth are read fresh each frame, and a step changed from outside
 * (slider, buttons) re-seeds the playhead instead of being fought.
 */
export function usePlayback(first: number, last: number): void {
  // Mode shapes animate by phase instead (useModeAnimation).
  const playing = useAppStore((s) => s.resultsView.playing && s.resultsView.type !== 'mode')

  useEffect(() => {
    const { setResultsView } = useAppStore.getState()
    if (!playing) return
    const span = last - first
    if (span < 1) { setResultsView({ playing: false }); return }

    const start = useAppStore.getState().resultsView
    let pos = start.step >= last || start.step < first ? 0 : start.step - first + start.stepFrac
    let written = { step: -1, frac: -1 }
    let previous = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const rv = useAppStore.getState().resultsView
      if (!rv.playing) return
      // Something else moved the playhead (slider, step buttons): continue from there.
      if (written.step !== -1 && (rv.step !== written.step || rv.stepFrac !== written.frac)) pos = rv.step - first + rv.stepFrac
      pos += ((now - previous) / 1000) * rv.fps
      previous = now
      let finished = false
      if (pos >= span) {
        if (rv.loop) pos %= span
        else { pos = span; finished = true }
      }
      const rel = Math.floor(pos)
      const step = first + rel
      const frac = rv.smooth && rel < span ? pos - rel : 0
      if (step !== written.step || frac !== written.frac || finished) {
        written = { step, frac }
        setResultsView({ step, stepFrac: frac, ...(finished ? { playing: false } : {}) })
      }
      if (!finished) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, first, last])
}
