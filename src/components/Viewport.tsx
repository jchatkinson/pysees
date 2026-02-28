import { useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAppStore } from '@/store/useAppStore'
import { ViewportScene, type ViewportSceneRef } from './r3f/ViewportScene'

type MarqueeRect = { x1: number; y1: number; x2: number; y2: number }

export function Viewport() {
  const mode = useAppStore((s) => s.mode)
  const hasConfig = useAppStore((s) => Boolean(s.config))
  const hasResults = useAppStore((s) => Boolean(s.results))
  const toggleNodeInSelection = useAppStore((s) => s.toggleNodeInSelection)

  const sceneRef = useRef<ViewportSceneRef>(null)
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const marqueeActive = useRef(false)
  const shiftDownPos = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative w-full h-full bg-muted/10">
      {/* Inner div intercepts Shift+drag for marquee selection before R3F gets the events */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDownCapture={(e) => {
          if (e.shiftKey && e.button === 0) {
            // Block OrbitControls from starting a pan, but don't activate marquee yet —
            // wait for movement > threshold so shift+click still reaches nodes via hitTestNode.
            e.stopPropagation()
            shiftDownPos.current = { x: e.clientX, y: e.clientY }
          }
        }}
        onPointerMoveCapture={(e) => {
          if (shiftDownPos.current === null) return
          e.stopPropagation()
          const dx = e.clientX - shiftDownPos.current.x
          const dy = e.clientY - shiftDownPos.current.y
          if (!marqueeActive.current && Math.hypot(dx, dy) > 5) {
            marqueeActive.current = true
            setMarquee({ x1: shiftDownPos.current.x, y1: shiftDownPos.current.y, x2: e.clientX, y2: e.clientY })
          } else if (marqueeActive.current) {
            setMarquee((m) => m ? { ...m, x2: e.clientX, y2: e.clientY } : null)
          }
        }}
        onPointerUpCapture={(e) => {
          if (shiftDownPos.current === null) return
          e.stopPropagation()
          const wasMarquee = marqueeActive.current
          marqueeActive.current = false
          shiftDownPos.current = null
          if (wasMarquee) {
            if (marquee && sceneRef.current && containerRef.current) {
              const bounds = containerRef.current.getBoundingClientRect()
              sceneRef.current.selectInRect({
                x1: Math.min(marquee.x1, marquee.x2) - bounds.left,
                y1: Math.min(marquee.y1, marquee.y2) - bounds.top,
                x2: Math.max(marquee.x1, marquee.x2) - bounds.left,
                y2: Math.max(marquee.y1, marquee.y2) - bounds.top,
              })
            }
            setMarquee(null)
          } else if (sceneRef.current && containerRef.current) {
            // Shift+click without drag: hit-test the nearest node and toggle it
            const bounds = containerRef.current.getBoundingClientRect()
            const id = sceneRef.current.hitTestNode(e.clientX - bounds.left, e.clientY - bounds.top)
            if (id !== null) toggleNodeInSelection(id, true)
          }
        }}
      >
        <Canvas
          camera={{ position: [8, 8, 10], fov: 45, near: 0.1, far: 2000 }}
          gl={{ antialias: true }}
        >
          <ViewportScene ref={sceneRef} />
        </Canvas>
      </div>

      {/* Marquee selection rectangle overlay */}
      {marquee && containerRef.current && (() => {
        const bounds = containerRef.current.getBoundingClientRect()
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: Math.min(marquee.x1, marquee.x2) - bounds.left,
              top: Math.min(marquee.y1, marquee.y2) - bounds.top,
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
              border: '1.5px dashed hsl(var(--primary))',
              background: 'hsl(var(--primary) / 0.12)',
              zIndex: 50,
              transform: 'translateZ(0)',
            }}
          />
        )
      })()}

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
    </div>
  )
}
