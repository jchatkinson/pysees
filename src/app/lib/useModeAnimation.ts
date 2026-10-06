import { useEffect } from 'react'
import { useAppStore } from '@/app/store/useAppStore'

/** Advances `resultsView.phase` from a requestAnimationFrame loop while a mode shape is `playing` (speed read fresh each frame). */
export function useModeAnimation(): void {
  const active = useAppStore((s) => s.resultsView.playing && s.resultsView.type === 'mode')
  useEffect(() => {
    if (!active) return
    let previous = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const { resultsView: rv, setResultsView } = useAppStore.getState()
      if (!rv.playing || rv.type !== 'mode') return
      setResultsView({ phase: (rv.phase + 2 * Math.PI * rv.modeSpeed * ((now - previous) / 1000)) % (2 * Math.PI) })
      previous = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
}
