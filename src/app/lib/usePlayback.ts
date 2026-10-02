import { useEffect } from 'react'
import { useAppStore } from '@/app/store/useAppStore'

/**
 * Drives `resultsView.step` (and `stepFrac` for smooth playback) from a requestAnimationFrame loop
 * while `playing`. Speed, loop and smooth are read fresh each frame, and a step changed from outside
 * (slider, buttons) re-seeds the playhead instead of being fought.
 */
export function usePlayback(sampleCount: number): void {
  const playing = useAppStore((s) => s.resultsView.playing)

  useEffect(() => {
    const { setResultsView } = useAppStore.getState()
    if (!playing) return
    const lastStep = sampleCount - 1
    if (lastStep < 1) { setResultsView({ playing: false }); return }

    const start = useAppStore.getState().resultsView
    let pos = start.step >= lastStep ? 0 : start.step + start.stepFrac
    let written = { step: -1, frac: -1 }
    let previous = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const rv = useAppStore.getState().resultsView
      if (!rv.playing) return
      // Something else moved the playhead (slider, step buttons): continue from there.
      if (written.step !== -1 && (rv.step !== written.step || rv.stepFrac !== written.frac)) pos = rv.step + rv.stepFrac
      pos += ((now - previous) / 1000) * rv.fps
      previous = now
      let finished = false
      if (pos >= lastStep) {
        if (rv.loop) pos %= lastStep
        else { pos = lastStep; finished = true }
      }
      const step = Math.floor(pos)
      const frac = rv.smooth && step < lastStep ? pos - step : 0
      if (step !== written.step || frac !== written.frac || finished) {
        written = { step, frac }
        setResultsView({ step, stepFrac: frac, ...(finished ? { playing: false } : {}) })
      }
      if (!finished) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, sampleCount])
}
