import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAppStore } from '@/store/useAppStore'
import { ViewportScene, type ViewportSceneRef } from './r3f/ViewportScene'
import { MaterialPreviewOverlay } from './MaterialPreviewOverlay'

type MarqueeRect = { x1: number; y1: number; x2: number; y2: number }

export function Viewport() {
  const mode = useAppStore((s) => s.mode)
  const hasConfig = useAppStore((s) => Boolean(s.config))
  const hasResults = useAppStore((s) => Boolean(s.results))

  const sceneRef = useRef<ViewportSceneRef>(null)
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const marqueeActive = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [shiftDown, setShiftDown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftDown(true) }
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftDown(false) }
    const onBlur = () => setShiftDown(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <div className="relative w-full h-full bg-muted/10">
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDownCapture={(e) => {
          if (e.button !== 0 || e.shiftKey || !containerRef.current) return
          const bounds = containerRef.current.getBoundingClientRect()
          dragStart.current = { x: e.clientX - bounds.left, y: e.clientY - bounds.top }
        }}
        onPointerMoveCapture={(e) => {
          if (dragStart.current === null || !containerRef.current) return
          const bounds = containerRef.current.getBoundingClientRect()
          const x = e.clientX - bounds.left
          const y = e.clientY - bounds.top
          const dx = x - dragStart.current.x
          const dy = y - dragStart.current.y
          if (!marqueeActive.current && Math.hypot(dx, dy) > 5) {
            marqueeActive.current = true
            setMarquee({ x1: dragStart.current.x, y1: dragStart.current.y, x2: x, y2: y })
          } else if (marqueeActive.current) {
            setMarquee((m) => m ? { ...m, x2: x, y2: y } : null)
          }
        }}
        onPointerUpCapture={() => {
          if (dragStart.current === null || !sceneRef.current || !containerRef.current) return
          const wasMarquee = marqueeActive.current
          marqueeActive.current = false
          dragStart.current = null
          if (wasMarquee) {
            if (marquee) sceneRef.current.selectInRect(marquee)
            setMarquee(null)
          }
        }}
      >
        <Canvas
          camera={{ position: [8, 8, 10], fov: 45, near: 0.1, far: 2000 }}
          gl={{ antialias: true }}
        >
          <ViewportScene ref={sceneRef} shiftRotateEnabled={shiftDown} />
        </Canvas>
      </div>

      {/* Marquee selection rectangle overlay */}
      {marquee && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
            border: '1px solid rgba(59, 130, 246, 0.9)',
            background: 'rgba(147, 197, 253, 0.2)',
            zIndex: 50,
          }}
        />
      )}

      {!hasConfig && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="rounded-sm border bg-background/90 px-2 py-1 text-xs text-muted-foreground">
            Create a model to start
          </span>
        </div>
      )}
      {mode === 'results' && !hasResults && (
        <div className="absolute top-2 left-2 rounded-sm border bg-background/90 px-2 py-1 text-xs text-muted-foreground pointer-events-none">
          No results imported yet
        </div>
      )}
      <MaterialPreviewOverlay />
    </div>
  )
}
