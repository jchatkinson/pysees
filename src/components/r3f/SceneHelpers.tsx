import { Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'

export function SceneHelpers({ showGrid }: { showGrid: boolean }) {
  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 10]} intensity={0.8} />
      <axesHelper args={[2.5]} />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="#111827" />
      </GizmoHelper>
      {showGrid && (
        <Grid
          position={[0, 0, 0]}
          args={[120, 120]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#d1d5db"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={140}
          infiniteGrid
        />
      )}
    </>
  )
}
