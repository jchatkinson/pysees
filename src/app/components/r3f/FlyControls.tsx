import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type Camera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { shouldIgnoreHotkeys } from '@/app/lib/hotkeys'
import { useAppStore } from '@/app/store/useAppStore'

/** Keys the fly camera owns while it is on (taken before the ribbon's hotkeys see them). */
const MOVES: Record<string, [forward: number, right: number, up: number]> = {
  w: [1, 0, 0], s: [-1, 0, 0], d: [0, 1, 0], a: [0, -1, 0], e: [0, 0, 1], ' ': [0, 0, 1], q: [0, 0, -1], c: [0, 0, -1],
  arrowup: [1, 0, 0], arrowdown: [-1, 0, 0], arrowright: [0, 1, 0], arrowleft: [0, -1, 0],
}
/** Radians per pixel of mouse travel. */
const LOOK = 0.003
const MAX_PITCH = Math.PI / 2 - 0.01
/** Model-scaled flying speed per second: Shift ×4, Alt ×¼. */
const speedOf = (radius: number, m: { shift: boolean; alt: boolean }) => radius * 0.6 * (m.shift ? 4 : 1) * (m.alt ? 0.25 : 1)

/** Turn the camera by mouse travel, keeping its up axis level (yaw about `up`, pitch clamped short of straight up or down). */
function look(camera: Camera, dx: number, dy: number) {
  const up = camera.up.clone().normalize(), f = camera.getWorldDirection(new Vector3())
  const e1 = Math.abs(up.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  e1.sub(up.clone().multiplyScalar(e1.dot(up))).normalize()
  const e2 = up.clone().cross(e1)
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, Math.asin(Math.max(-1, Math.min(1, f.dot(up)))) - dy * LOOK))
  const yaw = Math.atan2(f.dot(e2), f.dot(e1)) - dx * LOOK
  const next = e1.multiplyScalar(Math.cos(yaw) * Math.cos(pitch)).add(e2.multiplyScalar(Math.sin(yaw) * Math.cos(pitch))).add(up.multiplyScalar(Math.sin(pitch)))
  camera.lookAt(camera.position.clone().add(next))
}

/**
 * Fly mode for the 3D perspective view: WASD / arrows move along the view, Q/E (or C/Space) down and up, right-drag (pointer locked) looks
 * around, the wheel steps forward and back, Shift is faster and Alt slower, Esc ends it. Speeds scale with the model (`radius`). The orbit
 * controls are off meanwhile; on the way out their target is put on the view ray, so orbiting carries on from where the camera ended up.
 */
export function FlyControls({ radius, center }: { radius: number; center: Vector3 }) {
  const { camera, gl, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const held = useRef(new Set<string>())
  const fast = useRef({ shift: false, alt: false })
  const scale = useRef({ radius, center })
  useEffect(() => { scale.current = { radius, center } }, [radius, center])

  useEffect(() => {
    const el = gl.domElement
    let looking = false
    const keyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreHotkeys(e.target) || e.ctrlKey || e.metaKey) return
      fast.current = { shift: e.shiftKey, alt: e.altKey }
      const k = e.key.toLowerCase()
      if (k === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); useAppStore.getState().setFlyMode(false); return }
      if (!MOVES[k]) return
      e.preventDefault(); e.stopImmediatePropagation()
      held.current.add(k); invalidate()
    }
    const keyUp = (e: KeyboardEvent) => { fast.current = { shift: e.shiftKey, alt: e.altKey }; held.current.delete(e.key.toLowerCase()) }
    const blur = () => held.current.clear()
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return
      looking = true
      // Pointer lock gives unbounded turning; without it (refused, or unsupported) plain movement deltas still work.
      Promise.resolve(el.requestPointerLock?.()).catch(() => {})
    }
    const up = (e: PointerEvent) => { if (e.button !== 2 || !looking) return; looking = false; if (document.pointerLockElement === el) document.exitPointerLock() }
    const move = (e: MouseEvent) => { if (!looking) return; look(camera, e.movementX, e.movementY); invalidate() }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.position.addScaledVector(camera.getWorldDirection(new Vector3()), -Math.sign(e.deltaY) * speedOf(scale.current.radius, fast.current) * 0.15)
      invalidate()
    }
    const menu = (e: Event) => e.preventDefault()
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', blur)
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    document.addEventListener('mousemove', move)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', menu)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('keyup', keyUp, true)
      window.removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      document.removeEventListener('mousemove', move)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', menu)
      if (document.pointerLockElement === el) document.exitPointerLock()
    }
  }, [camera, gl, invalidate])

  // Hand back to orbiting: the target goes on the view ray, as far ahead as the model's centre (or a little way, facing away from it).
  useEffect(() => () => {
    if (!controls) return
    const { radius, center } = scale.current
    const f = camera.getWorldDirection(new Vector3())
    const ahead = Math.max(radius * 0.05, center.clone().sub(camera.position).dot(f))
    controls.target.copy(camera.position).addScaledVector(f, ahead)
    controls.update()
    invalidate()
  }, [camera, controls, invalidate])

  useFrame((_, delta) => {
    if (held.current.size === 0) return
    let [fw, rt, upw] = [0, 0, 0]
    for (const k of held.current) { const m = MOVES[k]; if (m) { fw += m[0]; rt += m[1]; upw += m[2] } }
    const f = camera.getWorldDirection(new Vector3()), up = camera.up.clone().normalize(), right = f.clone().cross(up).normalize()
    const step = speedOf(scale.current.radius, fast.current) * Math.min(delta, 0.05)
    camera.position.addScaledVector(f, fw * step).addScaledVector(right, rt * step).addScaledVector(up, upw * step)
    camera.updateMatrixWorld()
    invalidate() // keep drawing while a key is held (the canvas renders on demand)
  })
  return null
}
