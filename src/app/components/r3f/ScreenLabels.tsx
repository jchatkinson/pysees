import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type Camera } from 'three'
import { useCameraChange } from './batchHooks'

export interface ScreenLabel { position: [number, number, number]; text: string }

const v = new Vector3()

/**
 * Many text labels as one absolutely positioned DOM layer over the canvas, placed in one pass when the camera moves; labels off
 * screen or behind the camera are hidden. Replaces a drei `<Html>` per label, each of which projects itself every frame.
 */
export function ScreenLabels({ labels, style, offset = [4, -16] }: { labels: ScreenLabel[]; style: Partial<CSSStyleDeclaration>; offset?: [number, number] }) {
  const gl = useThree((s) => s.gl)
  const changed = useCameraChange()
  const layer = useMemo(() => {
    const div = document.createElement('div')
    Object.assign(div.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '10' })
    return div
  }, [])
  const spans = useRef<HTMLSpanElement[]>([])
  const forceRef = useRef(true)
  useEffect(() => {
    const parent = gl.domElement.parentElement
    parent?.appendChild(layer)
    return () => { layer.remove() }
  }, [gl, layer])
  useEffect(() => {
    layer.replaceChildren()
    spans.current = labels.map((l) => {
      const s = document.createElement('span')
      Object.assign(s.style, { position: 'absolute', left: '0', top: '0', whiteSpace: 'pre', userSelect: 'none', ...style })
      s.textContent = l.text
      layer.appendChild(s)
      return s
    })
    forceRef.current = true
  }, [labels, layer, style])
  useFrame((state) => {
    if (!changed(state, forceRef.current)) return
    forceRef.current = false
    place(labels, spans.current, state.camera, state.size.width, state.size.height, offset)
  })
  return null
}

function place(labels: ScreenLabel[], spans: HTMLSpanElement[], camera: Camera, w: number, h: number, [ox, oy]: [number, number]) {
  for (let i = 0; i < labels.length; i++) {
    const s = spans[i]
    if (!s) continue
    v.set(...labels[i].position).project(camera)
    const x = (v.x + 1) * 0.5 * w, y = (1 - v.y) * 0.5 * h
    const visible = v.z <= 1 && v.z >= -1 && x > -50 && x < w + 50 && y > -20 && y < h + 20
    s.style.display = visible ? '' : 'none'
    if (visible) s.style.transform = `translate(${Math.round(x + ox)}px, ${Math.round(y + oy)}px)`
  }
}
