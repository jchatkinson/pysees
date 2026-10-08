import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { DoubleSide } from 'three'
import type { Mesh } from 'three'
import { useAppStore } from '@/app/store/useAppStore'
import { isDiagramType } from '@/app/types/resultsView'
import { BufferLines } from './BufferLines'
import type { DiagramLabel, DisplayBuffers } from './displayBuffers'

const OUTLINE_COLOR = 0x334155
const OUTLINE_WIDTH_PX = 1.5

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9, color: '#0f172a', background: 'rgba(255,255,255,0.85)', borderRadius: 2, padding: '0 3px',
  lineHeight: '14px', whiteSpace: 'nowrap', userSelect: 'none', pointerEvents: 'none',
}

const fmt = (v: number) => Number(v.toPrecision(3)).toString()

function DiagramFill({ buffers }: { buffers: DisplayBuffers }) {
  const ref = useRef<Mesh>(null)
  const seen = useRef(-1)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.visible = buffers.diagramActive
    if (!m.visible || seen.current === buffers.diagramVersion) return
    m.geometry.attributes.position.needsUpdate = true
    m.geometry.attributes.color.needsUpdate = true
    m.geometry.setDrawRange(0, buffers.diagramFillVertices)
    seen.current = buffers.diagramVersion
  })
  return (
    <mesh ref={ref} frustumCulled={false} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.diagramFill, 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers.diagramFillColor, 3]} />
      </bufferGeometry>
      <meshBasicMaterial vertexColors transparent opacity={0.35} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function DiagramLabels({ buffers }: { buffers: DisplayBuffers }) {
  const [shown, setShown] = useState<{ version: number; labels: DiagramLabel[] }>({ version: -1, labels: [] })
  useFrame(() => { if (shown.version !== buffers.diagramVersion) setShown({ version: buffers.diagramVersion, labels: buffers.diagramActive ? buffers.diagramLabels : [] }) })
  return (
    <>
      {shown.labels.filter((l) => Math.abs(l.value) > 1e-9).map((l, i) => (
        <Html key={i} position={l.position} center style={LABEL_STYLE} zIndexRange={[10, 10]}>{fmt(l.value)}</Html>
      ))}
    </>
  )
}

/** N/V/M/T force diagrams (filled, outlined, optionally labelled) drawn from the buffers ResultsDriver fills. */
export function DiagramLayer({ buffers }: { buffers: DisplayBuffers }) {
  const active = useAppStore((s) => s.resultsView.runId !== null && isDiagramType(s.resultsView.type))
  const fill = useAppStore((s) => s.resultsView.fillDiagrams)
  const showValues = useAppStore((s) => s.resultsView.showValues)
  if (!active) return null
  return (
    <>
      {fill && <DiagramFill buffers={buffers} />}
      <BufferLines positions={buffers.diagramLines} color={OUTLINE_COLOR} widthPx={OUTLINE_WIDTH_PX} isActive={() => buffers.diagramActive} getVersion={() => buffers.diagramVersion} getCount={() => buffers.diagramLineSegments} />
      {showValues && <DiagramLabels buffers={buffers} />}
    </>
  )
}
