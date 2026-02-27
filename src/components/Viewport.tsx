import { Canvas } from '@react-three/fiber'
import { useAppStore } from '@/store/useAppStore'
import { ViewportScene } from './r3f/ViewportScene'

export function Viewport() {
  const mode = useAppStore((s) => s.mode)
  const hasConfig = useAppStore((s) => Boolean(s.config))
  const hasResults = useAppStore((s) => Boolean(s.results))

  return (
    <div className="relative w-full h-full bg-muted/10">
      <Canvas
        camera={{ position: [8, 8, 10], fov: 45, near: 0.1, far: 2000 }}
        gl={{ antialias: true }}
      >
        <ViewportScene />
      </Canvas>
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
