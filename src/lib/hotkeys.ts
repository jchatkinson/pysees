import { useEffect } from 'react'

export interface HotkeyBinding {
  id: string
  description: string
  key: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  when?: () => boolean
  action: () => void
}

export function shouldIgnoreHotkeys(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.closest('[data-hotkeys-ignore="true"]')) return true
  const tag = el.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

function matches(e: KeyboardEvent, b: HotkeyBinding) {
  return (
    e.key.toLowerCase() === b.key.toLowerCase()
    && Boolean(b.meta) === e.metaKey
    && Boolean(b.ctrl) === e.ctrlKey
    && Boolean(b.shift) === e.shiftKey
    && Boolean(b.alt) === e.altKey
  )
}

export function useHotkeyRegistry(bindings: HotkeyBinding[]) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreHotkeys(e.target)) return
      for (const binding of bindings) {
        if (!binding.when || binding.when()) {
          if (matches(e, binding)) {
            e.preventDefault()
            binding.action()
            return
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bindings])
}

