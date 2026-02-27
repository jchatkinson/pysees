import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, Text } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
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

function NodalLoadGlyph({ coords, values }: { coords: number[]; values: number[] }) {
  const origin = new Vector3(...toVec3(coords))
  const dir = new Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0)
  if (dir.length() < 1e-9) return null
  const tip = origin.clone().add(dir.normalize().multiplyScalar(1.2))
  const side = dir.clone().normalize().multiplyScalar(0.2)
  const up = new Vector3(0, 0, 1)
  const right = new Vector3().crossVectors(side, up).normalize().multiplyScalar(0.12)
  return (
    <group>
      <Line points={[origin.toArray() as [number, number, number], tip.toArray() as [number, number, number]]} color="#2563eb" lineWidth={2} />
      <Line points={[tip.toArray() as [number, number, number], tip.clone().sub(side).add(right).toArray() as [number, number, number]]} color="#2563eb" lineWidth={2} />
      <Line points={[tip.toArray() as [number, number, number], tip.clone().sub(side).sub(right).toArray() as [number, number, number]]} color="#2563eb" lineWidth={2} />
    </group>
  )
}

function ViewportScene() {
  const model = useModelState()
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const viewportAction = useAppStore((s) => s.viewportAction)
  const viewSettings = useAppStore((s) => s.viewSettings)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()

  const nodes = useMemo(() => [...model.nodes.values()].sort((a, b) => a.id - b.id), [model.nodes])
  const elements = useMemo(() => [...model.elements.values()].sort((a, b) => a.id - b.id), [model.elements])
  const fixes = useMemo(() => [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId), [model.fixes])

  useEffect(() => {
    if (!viewportAction) return
    const controls = controlsRef.current
    if (!controls) return
    const currentOffset = camera.position.clone().sub(controls.target)
    const currentDistance = currentOffset.length() || 1

    if (viewportAction.kind === 'zoomIn' || viewportAction.kind === 'zoomOut') {
      const factor = viewportAction.kind === 'zoomIn' ? 1 / 1.2 : 1.2
      const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, currentDistance * factor))
      camera.position.copy(controls.target.clone().add(currentOffset.normalize().multiplyScalar(nextDistance)))
      controls.update()
      return
    }

    if (!(camera instanceof PerspectiveCamera)) return
    const box = new Box3()
    for (const node of model.nodes.values()) box.expandByPoint(new Vector3(...toVec3(node.coords)))
    const hasGeometry = box.min.x <= box.max.x && box.min.y <= box.max.y && box.min.z <= box.max.z
    const center = hasGeometry ? box.getCenter(new Vector3()) : new Vector3(0, 0, 0)
    const size = hasGeometry ? box.getSize(new Vector3()) : new Vector3(4, 4, 4)
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.5
    const fov = (camera.fov * Math.PI) / 180
    const fitDistance = (radius / Math.tan(fov / 2)) * 1.25
    const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, fitDistance))
    const direction = currentOffset.normalize()
    controls.target.copy(center)
    camera.position.copy(center.clone().add(direction.multiplyScalar(nextDistance)))
    controls.update()
  }, [camera, model.nodes, viewportAction])

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 10]} intensity={0.8} />
      {viewSettings.showGrid && <Grid position={[0, 0, 0]} args={[120, 120]} cellSize={1} cellThickness={0.5} cellColor="#d1d5db" sectionSize={5} sectionThickness={1} sectionColor="#9ca3af" fadeDistance={140} infiniteGrid />}
      <axesHelper args={[2.5]} />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="#111827" />
      </GizmoHelper>
      {viewSettings.showElements && elements.map((element) => {
        const points = element.nodes.map((nodeId) => model.nodes.get(nodeId)).filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => toVec3(node.coords))
        return <ElementLine key={element.id} points={points} />
      })}
      {viewSettings.showElementIds && elements.map((element) => {
        const points = element.nodes.map((nodeId) => model.nodes.get(nodeId)).filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => toVec3(node.coords))
        if (points.length < 2) return null
        const mid = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] as [number, number, number], [0, 0, 0] as [number, number, number]).map((v) => v / points.length) as [number, number, number]
        return <Text key={`eid-${element.id}`} position={[mid[0], mid[1], mid[2] + 0.2]} fontSize={0.25} color="#334155">{`E${element.id}`}</Text>
      })}
      {viewSettings.showNodes && nodes.map((node) => (
        <NodeMesh key={node.id} id={node.id} coords={node.coords} selected={selectedNodeId === node.id} onSelect={setSelectedNodeId} />
      ))}
      {viewSettings.showNodeIds && nodes.map((node) => (
        <Text key={`nid-${node.id}`} position={[node.coords[0] ?? 0, node.coords[1] ?? 0, (node.coords[2] ?? 0) + 0.3]} fontSize={0.25} color="#475569">{`N${node.id}`}</Text>
      ))}
      {viewSettings.showSupports && fixes.map((fix) => {
        const node = model.nodes.get(fix.nodeId)
        if (!node) return null
        return <FixGlyph key={fix.nodeId} coords={node.coords} dofs={fix.dofs} />
      })}
      {viewSettings.showNodalLoads && model.loads.map((load, idx) => {
        const node = model.nodes.get(load.nodeId)
        if (!node) return null
        return <NodalLoadGlyph key={`load-${idx}`} coords={node.coords} values={load.values} />
      })}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate
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
