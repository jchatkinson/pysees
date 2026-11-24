import type { LucideIcon } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Toggle } from '@/app/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { cn } from '@/app/lib/utils'
import { formatHotkey } from './commands'

export function Tip({ text, hotkey, children }: { text: string; hotkey?: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{text}{hotkey && <span className="ml-2 opacity-60">{formatHotkey(hotkey)}</span>}</TooltipContent>
    </Tooltip>
  )
}

/** One ribbon button: icon over a label (icon only when `compact`); a toggle when `pressed` is given. */
export function RibbonAction({ label, tip, icon: Icon, hotkey, onClick, disabled, compact, pressed }: {
  label: string; tip?: string; icon: LucideIcon; hotkey?: string; onClick: () => void; disabled?: boolean; compact: boolean; pressed?: boolean
}) {
  const body = compact ? <Icon className="size-4" /> : <><Icon className="size-4" /><span className="text-[10px] leading-none">{label}</span></>
  const cls = compact ? 'size-7 p-0 rounded-none' : 'h-11 min-w-11 flex-col gap-1 px-1.5 rounded-none'
  const trigger = pressed !== undefined
    ? <Toggle aria-label={tip ?? label} pressed={pressed} disabled={disabled} onPressedChange={onClick} className={cn(cls, 'aria-pressed:bg-muted aria-pressed:text-foreground aria-pressed:shadow-[inset_0_-2px_0_var(--primary)]')}>{body}</Toggle>
    : <Button variant="ghost" aria-label={tip ?? label} disabled={disabled} onClick={onClick} className={cls}>{body}</Button>
  return <Tip text={tip ?? label} hotkey={hotkey}>{trigger}</Tip>
}
