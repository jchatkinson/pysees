import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { useAppStore } from '@/app/store/useAppStore'
import { cn } from '@/app/lib/utils'
import { COMMANDS, RIBBON_TABS, formatHotkey, runCommand, type CommandId, type RibbonCommand } from './commands'

/** Where each command lives in the ribbon ("View › Show"), for the palette's second column. */
const PLACES = (() => {
  const out = new Map<string, string>()
  for (const t of RIBBON_TABS) for (const g of t.groups) for (const id of g.commands ?? []) if (!out.has(id)) out.set(id, `${t.label} › ${g.label}`)
  return out
})()

/** Ctrl/⌘+K: search every ribbon command by name or tooltip and run it. */
export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <DialogContent className="sm:max-w-md p-0 gap-0" showCloseButton={false}><DialogTitle className="sr-only">Commands</DialogTitle><PaletteBody onDone={() => setOpen(false)} /></DialogContent>}
    </Dialog>
  )
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const state = useAppStore()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (Object.entries(COMMANDS) as [CommandId, RibbonCommand][])
      .filter(([id, c]) => id !== 'palette' && (c.visible?.(state) ?? true))
      .filter(([, c]) => !q || `${c.label} ${c.tip ?? ''}`.toLowerCase().includes(q))
      .map(([id, c]) => ({ id, c, enabled: c.enabled?.(state) ?? true, on: c.isActive?.(state) }))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled))
  }, [query, state])
  const run = (i: number) => { const item = list[i]; if (!item?.enabled) return; onDone(); runCommand(item.id) }
  const at = Math.min(active, Math.max(0, list.length - 1))
  return (
    <div className="grid" data-hotkeys-ignore="true">
      <Input autoFocus className="h-10 rounded-none border-0 border-b text-sm focus-visible:ring-0" placeholder="Type a command…" value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(at + 1, list.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(at - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); run(at) }
        }} />
      <div className="max-h-80 overflow-y-auto py-1">
        {list.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No matching command.</p>}
        {list.map((item, i) => {
          const Icon = item.c.icon
          return (
            <button key={item.id} type="button" disabled={!item.enabled} onMouseEnter={() => setActive(i)} onClick={() => run(i)}
              className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:opacity-40', i === at && 'bg-accent text-accent-foreground')}>
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{item.c.tip ?? item.c.label}{item.on !== undefined && <span className="ml-1 opacity-60">({item.on ? 'on' : 'off'})</span>}</span>
              <span className="ml-auto shrink-0 text-[10px] opacity-60">{item.c.hotkey ? formatHotkey(item.c.hotkey[0]) : PLACES.get(item.id) ?? ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
