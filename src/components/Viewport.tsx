import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line } from '@react-three/drei'
import { useAppStore, useModelState } from '@/store/useAppStore'

const NODE_RADIUS = 0.12
const FIX_GLYPH_SIZE = 0.4

function toVec3(coords: number[]) {
  return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0] as [number, number, number]
}

function NodeMesh({ id, coords, selected, onSelect }: { id: number; coords: number[]; selected: boolean; onSelect: (id: number) => void }) {
  return (
    <mesh position={toVec3(coords)} onClick={() => onSelect(id)}>
      <sphereGeometry args={[NODE_RADIUS, 20, 20]} />
      <meshStandardMaterial color={selected ? '#2563eb' : '#111827'} />
    </mesh>
  )
}

function ElementLine({ points }: { points: [number, number, number][] }) {
  if (points.length < 2) return null
  return <Line points={points} color="#4b5563" lineWidth={2} />
}

function FixGlyph({ coords, dofs }: { coords: number[]; dofs: number[] }) {
  const [x, y, z] = toVec3(coords)
  const t = FIX_GLYPH_SIZE
  return (
    <group position={[x, y, z]}>
      {dofs.includes(1) && <Line points={[[-t, 0, 0], [t, 0, 0]]} color="#dc2626" lineWidth={2} />}
      {dofs.includes(2) && <Line points={[[0, -t, 0], [0, t, 0]]} color="#dc2626" lineWidth={2} />}
      {dofs.includes(3) && <Line points={[[0, 0, -t], [0, 0, t]]} color="#dc2626" lineWidth={2} />}
    </group>
  )
}

function ViewportScene() {
  const model = useModelState()
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const ndm = model.config?.ndm ?? 3
  const is2d = ndm === 2

  const nodes = useMemo(() => [...model.nodes.values()].sort((a, b) => a.id - b.id), [model.nodes])
  const elements = useMemo(() => [...model.elements.values()].sort((a, b) => a.id - b.id), [model.elements])
  const fixes = useMemo(() => [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId), [model.fixes])

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 10]} intensity={0.8} />
      <Grid position={[0, 0, 0]} args={[120, 120]} cellSize={1} cellThickness={0.5} cellColor="#d1d5db" sectionSize={5} sectionThickness={1} sectionColor="#9ca3af" fadeDistance={140} infiniteGrid />
      <axesHelper args={[2.5]} />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="#111827" />
      </GizmoHelper>
      {elements.map((element) => {
        const points = element.nodes.map((nodeId) => model.nodes.get(nodeId)).filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => toVec3(node.coords))
        return <ElementLine key={element.id} points={points} />
      })}
      {nodes.map((node) => (
        <NodeMesh key={node.id} id={node.id} coords={node.coords} selected={selectedNodeId === node.id} onSelect={setSelectedNodeId} />
      ))}
      {fixes.map((fix) => {
        const node = model.nodes.get(fix.nodeId)
        if (!node) return null
        return <FixGlyph key={fix.nodeId} coords={node.coords} dofs={fix.dofs} />
      })}
      <OrbitControls
        makeDefault
        enableRotate={!is2d}
        enablePan
        enableZoom
        screenSpacePanning
        target={[0, 0, 0]}
        minDistance={0.5}
        maxDistance={500}
      />
    </>
  )
}

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
          <span className="rounded-sm border bg-background/90 px-2 py-1 text-xs text-muted-foreground">Create a model to start</span>
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
