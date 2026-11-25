import { useUnits } from '@/app/lib/units/useUnits'
import { RAMP_CSS } from '@/app/lib/shellContour'
import { areaLoadText, areaLoadUnit } from '@/app/components/r3f/utils'
import { useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAppStore } from '@/app/store/useAppStore'
import { ViewportScene, type ViewportSceneRef } from './r3f/ViewportScene'
import { MaterialPreviewOverlay } from './MaterialPreviewOverlay'
import { ResultExtremaOverlay } from './ResultExtremaOverlay'
import { ResultsDisplayPanel } from './ResultsDisplayPanel'
import { PlotOverlay } from './plot/PlotOverlay'
import { viewLabel } from '@/app/lib/editor/viewSlice'
import { currentView } from './ribbon/commands'
import { DrawOptions } from './DrawOptions'

type MarqueeRect = { x1: number; y1: number; x2: number; y2: number }

/** Which view is shown ("Plan @ L3 (z = 9)"), in the viewport's top-left corner. */
function ViewLabel() {
  const mode = useAppStore(currentView)
  const levels = useAppStore((s) => s.levels)
  const gridlines = useAppStore((s) => s.gridlines)
  const hiddenLabels = useAppStore((s) => s.hiddenLabels)
  return (
    <span className="absolute left-2 top-2 z-30 pointer-events-none rounded-sm border bg-background/90 px-1.5 py-0.5 text-[11px] font-medium">
      {viewLabel(mode, levels, gridlines, (v) => String(Number(v.toPrecision(6))))}
      {hiddenLabels.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground">· {hiddenLabels.join(', ')} hidden: too many in this view (try a plan or elevation)</span>}
    </span>
  )
}

/** Colour key of the shell load contour (total area load of the visible patterns). */
function ShellLoadLegend() {
  const range = useAppStore((s) => s.shellLoadRange)
  const units = useUnits()
  if (!range) return null
  const fmt = (v: number) => areaLoadText(units, v, false)
  return (
    <div className="absolute left-2 bottom-2 z-30 pointer-events-none w-44 rounded-sm border bg-background/90 px-2 py-1 text-[10px]">
      <div className="mb-1 font-medium">Shell load{units.active ? ` (${areaLoadUnit(units)})` : ''}</div>
      <div className="h-2 w-full rounded-sm" style={{ background: RAMP_CSS }} />
      <div className="mt-0.5 flex justify-between text-muted-foreground"><span>{fmt(range.min)}</span><span>hover a shell</span><span>{fmt(range.max)}</span></div>
    </div>
  )
}

export function Viewport() {
  const hasConfig = useAppStore((s) => Boolean(s.model.config))
  const ndm = useAppStore((s) => s.model.config?.ndm)

  const sceneRef = useRef<ViewportSceneRef>(null)
  const [canvasGen, setCanvasGen] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const genRef = useRef(0)
  const restart = () => { genRef.current++; setContextLost(false); setCanvasGen(genRef.current) }
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const marqueeActive = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const suppressNextClick = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative w-full h-full bg-muted/10">
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDownCapture={(e) => {
          // A draw tool owns left clicks: no box selection while drawing.
          if (e.button !== 0 || !containerRef.current || useAppStore.getState().activeTool !== 'select') return
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
        onPointerUpCapture={(e) => {
          if (dragStart.current === null || !sceneRef.current || !containerRef.current) return
          const wasMarquee = marqueeActive.current
          marqueeActive.current = false
          dragStart.current = null
          if (wasMarquee) {
            if (marquee) sceneRef.current.selectInRect(marquee, e.shiftKey || e.ctrlKey || e.metaKey)
            setMarquee(null)
            // The browser still fires a native `click` after this pointerup (mousedown and
            // mouseup landed on the same canvas element), which would otherwise hit the
            // scene's empty-space handler and immediately clear the selection we just made.
            suppressNextClick.current = true
          }
        }}
        onClickCapture={(e) => {
          if (suppressNextClick.current) {
            suppressNextClick.current = false
            e.stopPropagation()
          }
        }}
      >
        {/* 3D models are Z-up. The orbit controls fix their up axis when created, so a different ndm remounts the canvas. */}
        <Canvas
          key={`${ndm}|${canvasGen}`}
          // Member lines are 2 px wide; give them a forgiving click target.
          raycaster={{ params: { Line2: { threshold: 6 } } } as never}
          camera={ndm === 3 ? { position: [10, -12, 8], up: [0, 0, 1], fov: 45, near: 0.1, far: 2000 } : { position: [8, 8, 10], fov: 45, near: 0.1, far: 2000 }}
          gl={{ antialias: true }}
          // Draw only when something changed (camera, store, results); an idle model costs nothing.
          frameloop="demand"
          // A lost GL context (driver reset, too many contexts) shows a notice; when the browser restores it, rebuild the scene.
          onCreated={({ gl }) => {
            // Only the live canvas counts: a replaced one is force-lost as it unmounts.
            const gen = genRef.current
            // A canvas replaced for a new model (keyed by ndm) is detached when it is force-lost; only a mounted one counts.
            gl.domElement.addEventListener('webglcontextlost', () => { if (gen === genRef.current && gl.domElement.isConnected) setContextLost(true) })
            gl.domElement.addEventListener('webglcontextrestored', () => { if (gen === genRef.current) restart() })
          }}
        >
          <ViewportScene ref={sceneRef} />
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

      {hasConfig && <ViewLabel />}
      {contextLost && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-background/70">
          <div className="grid gap-2 rounded-sm border bg-background p-3 text-xs shadow">
            <span>The 3D view lost its graphics context. It will come back when the browser restores it.</span>
            <button type="button" className="justify-self-start underline" onClick={restart}>Restart the 3D view now</button>
          </div>
        </div>
      )}
      {hasConfig && <DrawOptions />}
      {hasConfig && <ShellLoadLegend />}
      {!hasConfig && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="rounded-sm border bg-background/90 px-2 py-1 text-xs text-muted-foreground">
            Create a model to start
          </span>
        </div>
      )}
      <ResultsDisplayPanel />
      <ResultExtremaOverlay />
      <PlotOverlay />
      <MaterialPreviewOverlay />
    </div>
  )
}
